"""Discount eligibility and amount calculation.

The billing service calls ``find_applicable_discounts`` once per invoice. It
returns the discount lines to add, each carrying the rule, its amount and the
description to copy onto the invoice line. Tax is calculated afterwards, on the
discounted amount, by the billing service.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.discount import DiscountRule
from app.models.enums import DiscountScope, InvoiceLineType, InvoiceStatus, ValueType
from app.models.invoice import Invoice, InvoiceLine
from app.models.subscription import Subscription

CENT = Decimal("0.01")


@dataclass(frozen=True)
class ApplicableDiscount:
    rule: DiscountRule
    amount: Decimal
    description: str


def _money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def find_applicable_discounts(
    db: Session,
    subscription: Subscription,
    subtotal: Decimal | int | float | str,
    today: date,
) -> list[ApplicableDiscount]:
    """Return the discounts that apply to one subscription invoice.

    A rule applies when it is active, inside its date range, has uses left,
    matches the subscription scope, and meets its minimum purchase and
    quantity. Percent discounts apply to the invoice subtotal (or to the
    product's lines for product-scoped rules), and minimums of product-scoped
    rules are checked against that product only; fixed discounts
    apply once per invoice. The returned amounts never exceed the subtotal.
    """
    subtotal = _money(subtotal)
    if subtotal <= 0:
        return []

    quantity_by_product: dict[int, int] = {}
    amount_by_product: dict[int, Decimal] = {}
    total_quantity = 0
    for line in subscription.lines:
        quantity_by_product[line.product_id] = (
            quantity_by_product.get(line.product_id, 0) + line.quantity
        )
        amount_by_product[line.product_id] = amount_by_product.get(
            line.product_id, Decimal("0")
        ) + _money(line.unit_price * line.quantity)
        total_quantity += line.quantity

    usage = (
        select(
            InvoiceLine.discount_rule_id.label("discount_rule_id"),
            func.count(InvoiceLine.id).label("used"),
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(
            InvoiceLine.line_type == InvoiceLineType.DISCOUNT,
            InvoiceLine.discount_rule_id.is_not(None),
            Invoice.status != InvoiceStatus.CANCELLED,
        )
        .group_by(InvoiceLine.discount_rule_id)
        .subquery()
    )
    used = func.coalesce(usage.c.used, 0)

    rules = db.scalars(
        select(DiscountRule)
        .outerjoin(usage, usage.c.discount_rule_id == DiscountRule.id)
        .where(
            DiscountRule.is_active.is_(True),
            DiscountRule.start_date <= today,
            or_(DiscountRule.end_date.is_(None), DiscountRule.end_date >= today),
            or_(
                DiscountRule.usage_limit.is_(None),
                used < DiscountRule.usage_limit,
            ),
            # Minimums of subscription-scoped rules are checked against the whole
            # invoice here; product-scoped rules are checked on their product below.
            or_(
                DiscountRule.scope == DiscountScope.PRODUCT,
                DiscountRule.min_purchase.is_(None),
                DiscountRule.min_purchase <= subtotal,
            ),
            or_(
                DiscountRule.scope == DiscountScope.PRODUCT,
                DiscountRule.min_quantity.is_(None),
                DiscountRule.min_quantity <= total_quantity,
            ),
        )
        .order_by(DiscountRule.id)
    ).all()

    applicable: list[ApplicableDiscount] = []
    remaining = subtotal
    for rule in rules:
        if remaining <= 0:
            break

        base = subtotal
        if rule.scope == DiscountScope.PRODUCT:
            if rule.product_id is None or rule.product_id not in quantity_by_product:
                continue
            quantity = quantity_by_product[rule.product_id]
            base = amount_by_product[rule.product_id]
            if rule.min_quantity is not None and quantity < rule.min_quantity:
                continue
            if rule.min_purchase is not None and base < rule.min_purchase:
                continue

        if rule.type == ValueType.PERCENT:
            amount = (base * rule.value / 100).quantize(
                CENT, rounding=ROUND_HALF_UP
            )
        else:
            amount = _money(rule.value)

        amount = min(amount, remaining)
        if amount <= 0:
            continue

        applicable.append(
            ApplicableDiscount(
                rule=rule,
                amount=amount,
                description=rule.name,
            )
        )
        remaining -= amount

    return applicable
