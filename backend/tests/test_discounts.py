from datetime import date
from decimal import Decimal

from app.models import (
    BillingPeriod,
    Customer,
    DiscountRule,
    DiscountScope,
    Invoice,
    InvoiceLine,
    InvoiceLineType,
    InvoiceStatus,
    Plan,
    Product,
    Subscription,
    SubscriptionLine,
    SubscriptionStatus,
    ValueType,
)
from app.services.discounts import find_applicable_discounts

TODAY = date(2026, 5, 15)


def _catalog(db):
    customer = Customer(name="Acme", email="acme@example.com")
    plan = Plan(
        name="Monthly",
        price=Decimal("100.00"),
        billing_period=BillingPeriod.MONTHLY,
        min_quantity=1,
        available_from=date(2026, 1, 1),
    )
    widget = Product(name="Widget", type="goods", sales_price=Decimal("100.00"))
    gadget = Product(name="Gadget", type="goods", sales_price=Decimal("50.00"))
    db.add_all([customer, plan, widget, gadget])
    db.flush()
    return customer, plan, widget, gadget


def _subscription(db, customer, plan, lines):
    subscription = Subscription(
        number="SUB-0001",
        customer_id=customer.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=TODAY,
        payment_terms_days=15,
    )
    db.add(subscription)
    db.flush()
    for product, quantity in lines:
        db.add(
            SubscriptionLine(
                subscription_id=subscription.id,
                product_id=product.id,
                quantity=quantity,
                unit_price=product.sales_price,
            )
        )
    db.commit()
    return subscription


def _rule(
    db,
    name,
    *,
    value_type=ValueType.FIXED,
    value="10.00",
    scope=DiscountScope.SUBSCRIPTION,
    product=None,
    start_date=TODAY,
    end_date=None,
    min_purchase=None,
    min_quantity=None,
    usage_limit=None,
    is_active=True,
):
    rule = DiscountRule(
        name=name,
        type=value_type,
        value=Decimal(value),
        scope=scope,
        product_id=product.id if product else None,
        start_date=start_date,
        end_date=end_date,
        min_purchase=Decimal(min_purchase) if min_purchase is not None else None,
        min_quantity=min_quantity,
        usage_limit=usage_limit,
        is_active=is_active,
    )
    db.add(rule)
    db.commit()
    return rule


def _invoice_with_discount(
    db,
    subscription,
    rule,
    *,
    status=InvoiceStatus.CONFIRMED,
    period_start=TODAY,
):
    invoice = Invoice(
        number=f"INV-{period_start.isoformat()}",
        subscription_id=subscription.id,
        customer_id=subscription.customer_id,
        period_start=period_start,
        period_end=period_start,
        status=status,
        issue_date=period_start,
        due_date=period_start,
        subtotal=Decimal("100.00"),
        discount_total=Decimal("10.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("90.00"),
        amount_paid=Decimal("0.00"),
    )
    db.add(invoice)
    db.flush()
    db.add(
        InvoiceLine(
            invoice_id=invoice.id,
            line_type=InvoiceLineType.DISCOUNT,
            description=rule.name,
            quantity=1,
            unit_price=Decimal("-10.00"),
            line_total=Decimal("-10.00"),
            discount_rule_id=rule.id,
        )
    )
    db.commit()
    return invoice


def test_percentage_discount_applies_to_the_subtotal(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 2)])
    rule = _rule(
        db,
        "Ten percent",
        value_type=ValueType.PERCENT,
        value="10.00",
    )

    discounts = find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY)

    assert [(d.rule, d.amount, d.description) for d in discounts] == [
        (rule, Decimal("10.00"), "Ten percent")
    ]


def test_fixed_discount_applies_once_per_invoice(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 3)])
    rule = _rule(db, "Fifteen off", value="15.00")

    discounts = find_applicable_discounts(db, subscription, Decimal("300.00"), TODAY)

    assert [(d.rule, d.amount) for d in discounts] == [(rule, Decimal("15.00"))]


def test_minimum_purchase_filters_rules(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    too_high = _rule(db, "Too high", min_purchase="150.00")
    met = _rule(db, "Met", min_purchase="100.00")

    discounts = find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY)

    assert [d.rule for d in discounts] == [met]
    assert too_high not in [d.rule for d in discounts]


def test_minimum_quantity_uses_subscription_quantity(db):
    customer, plan, widget, gadget = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 2), (gadget, 3)])
    too_high = _rule(db, "Too high", min_quantity=6)
    met = _rule(db, "Met", min_quantity=5)

    discounts = find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY)

    assert [d.rule for d in discounts] == [met]
    assert too_high not in [d.rule for d in discounts]


def test_inactive_discount_is_ignored(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    _rule(db, "Inactive", is_active=False)

    assert find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY) == []


def test_expired_discount_is_ignored(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    _rule(db, "Expired", start_date=date(2026, 1, 1), end_date=date(2026, 5, 14))

    assert find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY) == []


def test_discount_that_has_not_started_is_ignored(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    _rule(db, "Future", start_date=date(2026, 5, 16))

    assert find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY) == []


def test_exhausted_usage_limit_is_ignored(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    rule = _rule(db, "Once only", usage_limit=1)
    _invoice_with_discount(db, subscription, rule)

    assert find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY) == []


def test_cancelled_invoice_does_not_count_towards_usage_limit(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    rule = _rule(db, "Once only", usage_limit=1)
    _invoice_with_discount(db, subscription, rule, status=InvoiceStatus.CANCELLED)

    discounts = find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY)

    assert [d.rule for d in discounts] == [rule]


def test_subscription_and_product_scope(db):
    customer, plan, widget, gadget = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    subscription_rule = _rule(db, "Whole subscription")
    matching_rule = _rule(
        db, "Widget only", scope=DiscountScope.PRODUCT, product=widget
    )
    other_rule = _rule(
        db, "Gadget only", scope=DiscountScope.PRODUCT, product=gadget
    )

    discounts = find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY)

    assert [d.rule for d in discounts] == [subscription_rule, matching_rule]
    assert other_rule not in [d.rule for d in discounts]


def test_product_scope_minimum_quantity_uses_the_product_quantity(db):
    customer, plan, widget, gadget = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1), (gadget, 10)])
    widget_rule = _rule(
        db,
        "Widget bulk",
        scope=DiscountScope.PRODUCT,
        product=widget,
        min_quantity=5,
    )
    gadget_rule = _rule(
        db,
        "Gadget bulk",
        scope=DiscountScope.PRODUCT,
        product=gadget,
        min_quantity=5,
    )

    discounts = find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY)

    assert [d.rule for d in discounts] == [gadget_rule]
    assert widget_rule not in [d.rule for d in discounts]


def test_a_single_discount_never_exceeds_the_subtotal(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    _rule(db, "Huge", value="150.00")

    discounts = find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY)

    assert [d.amount for d in discounts] == [Decimal("100.00")]


def test_total_discounts_never_exceed_the_subtotal(db):
    customer, plan, widget, _ = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    _rule(db, "Sixty percent", value_type=ValueType.PERCENT, value="60.00")
    _rule(db, "Sixty off", value="60.00")

    discounts = find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY)

    assert [d.amount for d in discounts] == [Decimal("60.00"), Decimal("40.00")]
    assert sum(d.amount for d in discounts) == Decimal("100.00")


def test_product_scope_percent_applies_to_that_products_lines_only(db):
    customer, plan, widget, gadget = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1), (gadget, 2)])
    rule = _rule(
        db,
        "Widget ten percent",
        value_type=ValueType.PERCENT,
        value="10.00",
        scope=DiscountScope.PRODUCT,
        product=widget,
    )

    discounts = find_applicable_discounts(db, subscription, Decimal("200.00"), TODAY)

    assert [(d.rule, d.amount) for d in discounts] == [(rule, Decimal("10.00"))]


def test_product_scope_minimum_purchase_uses_that_products_amount(db):
    customer, plan, widget, gadget = _catalog(db)
    subscription = _subscription(db, customer, plan, [(widget, 1), (gadget, 2)])
    _rule(
        db,
        "Gadget big spend",
        scope=DiscountScope.PRODUCT,
        product=gadget,
        min_purchase="150.00",
    )

    # The invoice subtotal (200) clears the minimum, but gadget lines total only 100.
    assert find_applicable_discounts(db, subscription, Decimal("200.00"), TODAY) == []


def test_tax_calculated_on_the_discounted_amount(db):
    """TEAM_PLAN.md: pytest for tax calculated on the discounted amount."""
    from app.models.tax import Tax
    from app.services.billing import build_invoice_draft

    customer, plan, widget, _ = _catalog(db)
    # Assign 10% VAT to the widget
    vat = Tax(name="VAT 10%", type=ValueType.PERCENT, value=Decimal("10.00"), is_active=True)
    db.add(vat)
    db.flush()
    widget.tax_id = vat.id
    widget.tax = vat

    # Widget unit price is 100.00 with 10% tax. Line total = 100.00.
    subscription = _subscription(db, customer, plan, [(widget, 1)])
    subscription.next_billing_date = TODAY
    subscription.plan = plan
    db.commit()

    # 20.00 fixed discount on the subscription
    _rule(db, "Twenty off", value="20.00")

    discounts = find_applicable_discounts(db, subscription, Decimal("100.00"), TODAY)
    assert len(discounts) == 1
    assert discounts[0].amount == Decimal("20.00")

    # Build invoice draft with discounts applied
    draft = build_invoice_draft(subscription, TODAY, discounts=discounts)
    assert draft.subtotal == Decimal("100.00")
    assert draft.discount_total == Decimal("20.00")
    # Taxable base is discounted: 100 - 20 = 80.00. 10% tax on 80.00 = 8.00 (not 10.00 on 100)
    assert draft.tax_total == Decimal("8.00")
    assert draft.total == Decimal("88.00")

