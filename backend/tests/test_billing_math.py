from datetime import date
from decimal import Decimal

import pytest

from app.models.catalog import Plan, Product, ProductVariant
from app.models.discount import DiscountRule
from app.models.enums import (
    BillingPeriod,
    DiscountScope,
    SubscriptionStatus,
    ValueType,
)
from app.models.subscription import Subscription, SubscriptionLine
from app.models.tax import Tax
from app.services.billing import BillingError, build_invoice_draft
from app.services.discounts import ApplicableDiscount

TODAY = date(2026, 1, 31)


def _subscription(
    *,
    tax: Tax | None = None,
    quantity: int = 2,
    unit_price: Decimal = Decimal("100.00"),
    billing_period: BillingPeriod = BillingPeriod.MONTHLY,
    next_billing_date: date | None = TODAY,
    payment_terms_days: int = 15,
    variant: ProductVariant | None = None,
    lines: bool = True,
) -> Subscription:
    product = Product(name="Widget", type="software", sales_price=unit_price)
    if tax is not None:
        product.tax = tax
    line = SubscriptionLine(
        quantity=quantity,
        unit_price=unit_price,
        product=product,
        variant=variant,
    )
    plan = Plan(
        name="Monthly",
        price=unit_price,
        billing_period=billing_period,
        min_quantity=1,
        available_from=date(2020, 1, 1),
    )
    return Subscription(
        number="SUB-0001",
        status=SubscriptionStatus.ACTIVE,
        start_date=date(2026, 1, 1),
        payment_terms_days=payment_terms_days,
        next_billing_date=next_billing_date,
        plan=plan,
        lines=[line] if lines else [],
    )


def test_percent_tax_is_added_on_top_of_the_line_total() -> None:
    tax = Tax(name="VAT", type=ValueType.PERCENT, value=Decimal("20.00"))
    draft = build_invoice_draft(_subscription(tax=tax), TODAY)

    line = draft.lines[0]
    assert line.line_total == Decimal("200.00")
    assert line.tax_name == "VAT"
    assert line.tax_rate == Decimal("20.00")
    assert line.tax_amount == Decimal("40.00")
    assert draft.subtotal == Decimal("200.00")
    assert draft.discount_total == Decimal("0.00")
    assert draft.tax_total == Decimal("40.00")
    assert draft.total == Decimal("240.00")


def test_fixed_tax_is_charged_once_per_line() -> None:
    tax = Tax(name="Setup", type=ValueType.FIXED, value=Decimal("5.00"))
    draft = build_invoice_draft(_subscription(tax=tax), TODAY)

    assert draft.lines[0].tax_rate is None
    assert draft.lines[0].tax_amount == Decimal("5.00")
    assert draft.total == Decimal("205.00")


def test_no_tax_leaves_tax_fields_empty() -> None:
    draft = build_invoice_draft(_subscription(), TODAY)

    assert draft.lines[0].tax_name is None
    assert draft.lines[0].tax_rate is None
    assert draft.lines[0].tax_amount == Decimal("0.00")
    assert draft.total == Decimal("200.00")


def test_rounding_uses_half_up_to_the_cent() -> None:
    tax = Tax(name="VAT", type=ValueType.PERCENT, value=Decimal("7.50"))
    draft = build_invoice_draft(
        _subscription(tax=tax, quantity=3, unit_price=Decimal("0.33")), TODAY
    )

    assert draft.lines[0].line_total == Decimal("0.99")
    assert draft.lines[0].tax_amount == Decimal("0.07")
    assert draft.total == Decimal("1.06")


def test_variant_is_part_of_the_line_description() -> None:
    variant = ProductVariant(attribute="Brand", value="Odoo", extra_price=Decimal("560"))
    draft = build_invoice_draft(_subscription(variant=variant), TODAY)

    assert draft.lines[0].description == "Widget (Brand: Odoo)"


def test_billing_dates_follow_the_plan_and_payment_terms() -> None:
    draft = build_invoice_draft(
        _subscription(billing_period=BillingPeriod.MONTHLY), TODAY
    )

    assert draft.period_start == date(2026, 1, 31)
    assert draft.period_end == date(2026, 2, 27)
    assert draft.issue_date == TODAY
    assert draft.due_date == date(2026, 2, 15)


def test_subscription_without_lines_is_rejected() -> None:
    with pytest.raises(BillingError, match="no lines"):
        build_invoice_draft(_subscription(lines=False), TODAY)


def test_subscription_without_next_billing_date_is_rejected() -> None:
    with pytest.raises(BillingError, match="next billing date"):
        build_invoice_draft(_subscription(next_billing_date=None), TODAY)


def _discount(amount: str, scope=DiscountScope.SUBSCRIPTION, product_id=None):
    rule = DiscountRule(
        id=1,
        name="Promo",
        type=ValueType.FIXED,
        value=Decimal(amount),
        scope=scope,
        product_id=product_id,
    )
    return ApplicableDiscount(rule=rule, amount=Decimal(amount), description="Promo")


def test_tax_is_calculated_on_the_discounted_amount() -> None:
    tax = Tax(name="VAT", type=ValueType.PERCENT, value=Decimal("10.00"))
    draft = build_invoice_draft(
        _subscription(tax=tax), TODAY, [_discount("50.00")]
    )

    assert draft.subtotal == Decimal("200.00")
    assert draft.discount_total == Decimal("50.00")
    assert draft.tax_total == Decimal("15.00")  # 10% of (200 - 50)
    assert draft.total == Decimal("165.00")
    assert [d.amount for d in draft.discount_lines] == [Decimal("50.00")]


def test_product_scoped_discount_is_capped_at_its_target_lines() -> None:
    tax = Tax(name="VAT", type=ValueType.PERCENT, value=Decimal("10.00"))
    draft = build_invoice_draft(
        _subscription(tax=tax),
        TODAY,
        [_discount("500.00", scope=DiscountScope.PRODUCT)],
    )

    # The rule asks for 500 but only 200 of product is on the invoice.
    assert draft.subtotal == Decimal("200.00")
    assert draft.discount_total == Decimal("200.00")
    assert draft.tax_total == Decimal("0.00")
    assert draft.total == Decimal("0.00")
    assert [d.amount for d in draft.discount_lines] == [Decimal("200.00")]


def test_combined_discounts_never_exceed_the_subtotal() -> None:
    tax = Tax(name="VAT", type=ValueType.PERCENT, value=Decimal("10.00"))
    draft = build_invoice_draft(
        _subscription(tax=tax),
        TODAY,
        [_discount("150.00"), _discount("150.00")],
    )

    assert draft.discount_total == Decimal("200.00")
    assert draft.tax_total == Decimal("0.00")
    assert draft.total == Decimal("0.00")
    assert [d.amount for d in draft.discount_lines] == [
        Decimal("150.00"),
        Decimal("50.00"),
    ]
