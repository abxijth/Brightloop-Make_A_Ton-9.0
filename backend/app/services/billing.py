"""Subscription billing: turn due subscriptions into draft invoices.

The billing run is idempotent. Each subscription is billed inside its own
savepoint and the database unique constraint on
(subscription_id, period_start) is the final guard against billing a period
twice.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.catalog import Product
from app.models.enums import (
    DiscountScope,
    InvoiceLineType,
    InvoiceStatus,
    SubscriptionStatus,
    ValueType,
)
from app.models.invoice import Invoice, InvoiceLine
from app.models.subscription import Subscription, SubscriptionLine
from app.models.tax import Tax
from app.services.discounts import ApplicableDiscount, find_applicable_discounts
from app.services.numbering import next_invoice_number
from app.services.periods import advance_period, period_end

_CENT = Decimal("0.01")
_HUNDRED = Decimal("100")


class BillingError(Exception):
    """A subscription cannot be billed for a business reason."""


@dataclass(frozen=True)
class DraftLine:
    description: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    tax_name: str | None
    tax_rate: Decimal | None
    tax_amount: Decimal


@dataclass(frozen=True)
class DraftDiscountLine:
    discount_rule_id: int
    description: str
    amount: Decimal


@dataclass(frozen=True)
class InvoiceDraft:
    period_start: date
    period_end: date
    issue_date: date
    due_date: date
    lines: tuple[DraftLine, ...]
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    discount_lines: tuple[DraftDiscountLine, ...] = ()


@dataclass(frozen=True)
class BillingItem:
    subscription_id: int
    subscription_number: str
    outcome: Literal["created", "skipped", "failed"]
    reason: str | None = None
    invoice_id: int | None = None
    invoice_number: str | None = None


@dataclass
class BillingRunResult:
    created: list[BillingItem] = field(default_factory=list)
    skipped: list[BillingItem] = field(default_factory=list)
    failed: list[BillingItem] = field(default_factory=list)

    @property
    def created_count(self) -> int:
        return len(self.created)

    @property
    def skipped_count(self) -> int:
        return len(self.skipped)

    @property
    def failed_count(self) -> int:
        return len(self.failed)


def money(value: Decimal) -> Decimal:
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def _line_description(line: SubscriptionLine) -> str:
    product = line.product
    if line.variant is not None:
        return f"{product.name} ({line.variant.attribute}: {line.variant.value})"
    return product.name


def _line_tax(line: SubscriptionLine, line_total: Decimal) -> tuple[str | None, Decimal | None, Decimal]:
    tax: Tax | None = line.product.tax
    if tax is None:
        return None, None, money(Decimal("0"))
    if tax.type == ValueType.PERCENT:
        return tax.name, tax.value, money(line_total * tax.value / _HUNDRED)
    return tax.name, None, money(tax.value)


def _allocate_discounts(
    subscription: Subscription,
    line_totals: list[Decimal],
    discounts: tuple[ApplicableDiscount, ...] | list[ApplicableDiscount],
) -> list[Decimal]:
    """Spread each discount over the lines it covers, in proportion to their totals.

    Subscription-scoped discounts cover every line; product-scoped ones only the
    lines of their product. The last covered line takes the rounding remainder.
    """
    allocated = [Decimal("0")] * len(line_totals)
    for discount in discounts:
        if discount.rule.scope == DiscountScope.PRODUCT:
            targets = [
                i
                for i, line in enumerate(subscription.lines)
                if line.product_id == discount.rule.product_id
            ]
        else:
            targets = list(range(len(line_totals)))
        base = sum((line_totals[i] for i in targets), Decimal("0"))
        if not targets or base <= 0:
            continue
        remaining = discount.amount
        for i in targets[:-1]:
            share = money(discount.amount * line_totals[i] / base)
            allocated[i] += share
            remaining -= share
        allocated[targets[-1]] += remaining
    return allocated


def build_invoice_draft(
    subscription: Subscription,
    today: date,
    discounts: tuple[ApplicableDiscount, ...] | list[ApplicableDiscount] = (),
) -> InvoiceDraft:
    """Build invoice lines and totals without touching the database.

    Tax is calculated on each line's amount after its share of the discounts.
    """
    period_start = subscription.next_billing_date
    if period_start is None:
        raise BillingError("Subscription has no next billing date")
    if subscription.plan is None:
        raise BillingError("Subscription has no plan")
    if not subscription.lines:
        raise BillingError("Subscription has no lines")

    for line in subscription.lines:
        if line.product is None:
            raise BillingError(f"Subscription line {line.id} has no product")
    line_totals = [money(l.unit_price * l.quantity) for l in subscription.lines]
    allocated = _allocate_discounts(subscription, line_totals, discounts)

    lines: list[DraftLine] = []
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    for line, line_total, line_discount in zip(
        subscription.lines, line_totals, allocated
    ):
        tax_name, tax_rate, tax_amount = _line_tax(
            line, line_total - line_discount
        )
        lines.append(
            DraftLine(
                description=_line_description(line),
                quantity=line.quantity,
                unit_price=line.unit_price,
                line_total=line_total,
                tax_name=tax_name,
                tax_rate=tax_rate,
                tax_amount=tax_amount,
            )
        )
        subtotal += line_total
        tax_total += tax_amount

    subtotal = money(subtotal)
    tax_total = money(tax_total)
    discount_lines = tuple(
        DraftDiscountLine(d.rule.id, d.description, d.amount) for d in discounts
    )
    discount_total = money(sum((d.amount for d in discount_lines), Decimal("0")))
    return InvoiceDraft(
        period_start=period_start,
        period_end=period_end(period_start, subscription.plan.billing_period),
        issue_date=today,
        due_date=today + timedelta(days=subscription.payment_terms_days),
        lines=tuple(lines),
        subtotal=subtotal,
        discount_total=discount_total,
        tax_total=tax_total,
        total=money(subtotal - discount_total + tax_total),
        discount_lines=discount_lines,
    )


def due_subscriptions(db: Session, today: date) -> list[Subscription]:
    """Return active subscriptions whose next billing date has arrived."""
    statement = (
        select(Subscription)
        .where(Subscription.status == SubscriptionStatus.ACTIVE)
        .where(Subscription.next_billing_date.is_not(None))
        .where(Subscription.next_billing_date <= today)
        .order_by(Subscription.next_billing_date, Subscription.id)
        .options(
            joinedload(Subscription.plan),
            selectinload(Subscription.lines)
            .joinedload(SubscriptionLine.product)
            .joinedload(Product.tax),
            selectinload(Subscription.lines).joinedload(SubscriptionLine.variant),
        )
    )
    return list(db.scalars(statement).unique())


def _close_if_finished(subscription: Subscription) -> None:
    next_date = subscription.next_billing_date
    if next_date is None:
        return
    if subscription.expiry_date is not None and next_date > subscription.expiry_date:
        subscription.status = SubscriptionStatus.CLOSED
        return
    plan = subscription.plan
    if (
        plan is not None
        and plan.auto_close
        and plan.available_to is not None
        and next_date > plan.available_to
    ):
        subscription.status = SubscriptionStatus.CLOSED


def create_invoice_for_subscription(
    db: Session,
    subscription: Subscription,
    *,
    today: date,
    confirm: bool = False,
) -> Invoice:
    """Create one invoice, advance the schedule and close the subscription if done."""
    if subscription.next_billing_date is None:
        raise BillingError("Subscription has no next billing date")
    if (
        subscription.expiry_date is not None
        and subscription.next_billing_date > subscription.expiry_date
    ):
        raise BillingError("Subscription expired before this period")

    subtotal = money(
        sum((l.unit_price * l.quantity for l in subscription.lines), Decimal("0"))
    )
    discounts = find_applicable_discounts(db, subscription, subtotal, today)
    draft = build_invoice_draft(subscription, today, discounts)
    invoice = Invoice(
        number=next_invoice_number(db),
        subscription_id=subscription.id,
        customer_id=subscription.customer_id,
        period_start=draft.period_start,
        period_end=draft.period_end,
        status=InvoiceStatus.CONFIRMED if confirm else InvoiceStatus.DRAFT,
        issue_date=draft.issue_date,
        due_date=draft.due_date,
        subtotal=draft.subtotal,
        discount_total=draft.discount_total,
        tax_total=draft.tax_total,
        total=draft.total,
        amount_paid=money(Decimal("0")),
    )
    db.add(invoice)
    db.flush()

    for line in draft.lines:
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                line_type=InvoiceLineType.PRODUCT,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                tax_name=line.tax_name,
                tax_rate=line.tax_rate,
                tax_amount=line.tax_amount,
                line_total=line.line_total,
            )
        )
    for discount in draft.discount_lines:
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                line_type=InvoiceLineType.DISCOUNT,
                description=discount.description,
                quantity=1,
                unit_price=-discount.amount,
                tax_amount=money(Decimal("0")),
                line_total=-discount.amount,
                discount_rule_id=discount.discount_rule_id,
            )
        )
    db.flush()

    subscription.next_billing_date = advance_period(
        draft.period_start, subscription.plan.billing_period
    )
    _close_if_finished(subscription)
    db.flush()
    return invoice


def _is_duplicate_invoice(exc: IntegrityError) -> bool:
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None) == "uq_invoices_subscription_period"


def _reason(exc: Exception) -> str:
    return str(getattr(exc, "orig", exc))


def _item(
    subscription: Subscription,
    outcome: Literal["created", "skipped", "failed"],
    *,
    reason: str | None = None,
    invoice: Invoice | None = None,
) -> BillingItem:
    return BillingItem(
        subscription_id=subscription.id,
        subscription_number=subscription.number,
        outcome=outcome,
        reason=reason,
        invoice_id=invoice.id if invoice is not None else None,
        invoice_number=invoice.number if invoice is not None else None,
    )


def _skip_reason(subscription: Subscription) -> str | None:
    period_start = subscription.next_billing_date
    if period_start is None:
        return None
    if subscription.expiry_date is not None and period_start > subscription.expiry_date:
        subscription.status = SubscriptionStatus.CLOSED
        return "subscription expired"
    plan = subscription.plan
    if (
        plan is not None
        and plan.auto_close
        and plan.available_to is not None
        and period_start > plan.available_to
    ):
        subscription.status = SubscriptionStatus.CLOSED
        return "plan ended"
    return None


def run_billing(
    db: Session,
    *,
    subscription_ids: list[int] | None = None,
    confirm: bool = False,
    today: date | None = None,
) -> BillingRunResult:
    """Bill every due subscription, isolating failures with savepoints."""
    billing_date = today or date.today()
    result = BillingRunResult()
    subscriptions = due_subscriptions(db, billing_date)
    if subscription_ids is not None:
        wanted = set(subscription_ids)
        subscriptions = [s for s in subscriptions if s.id in wanted]

    for subscription in subscriptions:
        skip_reason = _skip_reason(subscription)
        if skip_reason is not None:
            db.flush()
            result.skipped.append(_item(subscription, "skipped", reason=skip_reason))
            continue

        try:
            with db.begin_nested():
                invoice = create_invoice_for_subscription(
                    db, subscription, today=billing_date, confirm=confirm
                )
        except IntegrityError as exc:
            if _is_duplicate_invoice(exc):
                result.skipped.append(
                    _item(subscription, "skipped", reason="already billed for this period")
                )
            else:
                result.failed.append(
                    _item(subscription, "failed", reason=_reason(exc))
                )
        except BillingError as exc:
            result.failed.append(_item(subscription, "failed", reason=str(exc)))
        except Exception as exc:  # noqa: BLE001  (one failure must not stop the batch)
            result.failed.append(_item(subscription, "failed", reason=_reason(exc)))
        else:
            result.created.append(_item(subscription, "created", invoice=invoice))

    return result
