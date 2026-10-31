from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.models.enums import (
    DiscountScope,
    InvoiceLineType,
    InvoiceStatus,
    SubscriptionStatus,
    ValueType,
)
from app.models.invoice import Invoice, InvoiceLine
from app.services import billing
from app.services.billing import due_subscriptions, run_billing
from billing_factories import (
    make_customer,
    make_discount,
    make_plan,
    make_product,
    make_subscription,
    make_tax,
)

TODAY = date(2026, 1, 31)


def _billed_subscription(db, **subscription_kwargs):
    customer = make_customer(db)
    tax = make_tax(db, value=Decimal("20.00"))
    product = make_product(db, tax=tax)
    plan_kwargs = subscription_kwargs.pop("plan_kwargs", {})
    plan = make_plan(db, **plan_kwargs)
    subscription = make_subscription(
        db,
        customer=customer,
        plan=plan,
        lines=[(product, 2, Decimal("100.00"))],
        next_billing_date=subscription_kwargs.pop("next_billing_date", TODAY),
        **subscription_kwargs,
    )
    return subscription, product, plan


def test_run_creates_an_invoice_and_advances_the_schedule(db) -> None:
    subscription, _, _ = _billed_subscription(db)

    result = run_billing(db, today=TODAY)

    assert result.created_count == 1
    assert result.skipped_count == 0
    assert result.failed_count == 0

    invoice = db.scalars(select(Invoice)).one()
    assert invoice.subscription_id == subscription.id
    assert invoice.customer_id == subscription.customer_id
    assert invoice.number.startswith("INV-")
    assert result.created[0].invoice_number == invoice.number
    assert invoice.status == InvoiceStatus.DRAFT
    assert invoice.period_start == date(2026, 1, 31)
    assert invoice.period_end == date(2026, 2, 27)
    assert invoice.issue_date == TODAY
    assert invoice.due_date == date(2026, 2, 15)
    assert invoice.subtotal == Decimal("200.00")
    assert invoice.discount_total == Decimal("0.00")
    assert invoice.tax_total == Decimal("40.00")
    assert invoice.total == Decimal("240.00")
    assert invoice.amount_paid == Decimal("0.00")

    line = db.scalars(select(InvoiceLine)).one()
    assert line.description == "Widget"
    assert line.quantity == 2
    assert line.unit_price == Decimal("100.00")
    assert line.line_total == Decimal("200.00")
    assert line.tax_name == "VAT"
    assert line.tax_rate == Decimal("20.00")
    assert line.tax_amount == Decimal("40.00")

    assert subscription.next_billing_date == date(2026, 2, 28)
    assert subscription.status == SubscriptionStatus.ACTIVE


def test_confirm_after_creating_marks_the_invoice_confirmed(db) -> None:
    _billed_subscription(db)

    run_billing(db, today=TODAY, confirm=True)

    assert db.scalars(select(Invoice)).one().status == InvoiceStatus.CONFIRMED


def test_due_list_only_contains_active_subscriptions_that_are_due(db) -> None:
    due, _, _ = _billed_subscription(db)
    _billed_subscription(db, next_billing_date=date(2026, 2, 1))
    _billed_subscription(db, status=SubscriptionStatus.DRAFT)
    _billed_subscription(db, status=SubscriptionStatus.CLOSED)

    assert [s.id for s in due_subscriptions(db, TODAY)] == [due.id]


def test_repeat_run_for_the_same_period_is_skipped(db) -> None:
    subscription, _, _ = _billed_subscription(db)
    run_billing(db, today=TODAY)

    # Simulate a stale or concurrent run that still sees the original period.
    subscription.next_billing_date = TODAY
    db.flush()

    second = run_billing(db, today=TODAY)

    assert second.created_count == 0
    assert second.skipped_count == 1
    assert "already billed" in second.skipped[0].reason
    assert len(db.scalars(select(Invoice)).all()) == 1


def test_subscription_closes_when_it_passes_its_expiry_date(db) -> None:
    subscription, _, _ = _billed_subscription(
        db, expiry_date=date(2026, 2, 15)
    )

    run_billing(db, today=TODAY)

    assert subscription.status == SubscriptionStatus.CLOSED


def test_plan_auto_close_closes_the_subscription_after_the_last_period(db) -> None:
    subscription, _, _ = _billed_subscription(
        db,
        plan_kwargs={
            "available_to": date(2026, 2, 15),
            "auto_close": True,
        },
    )

    run_billing(db, today=TODAY)

    assert subscription.status == SubscriptionStatus.CLOSED


def test_plan_end_without_auto_close_keeps_the_subscription_active(db) -> None:
    subscription, _, _ = _billed_subscription(
        db,
        plan_kwargs={
            "available_to": date(2026, 2, 15),
            "auto_close": False,
        },
    )

    run_billing(db, today=TODAY)

    assert subscription.status == SubscriptionStatus.ACTIVE


def test_expired_subscription_is_closed_and_skipped_without_an_invoice(db) -> None:
    later = date(2026, 3, 1)
    subscription, _, _ = _billed_subscription(
        db,
        next_billing_date=later,
        start_date=date(2026, 1, 1),
        expiry_date=date(2026, 2, 15),
    )

    result = run_billing(db, today=later)

    assert result.created_count == 0
    assert result.skipped_count == 1
    assert "expired" in result.skipped[0].reason
    assert subscription.status == SubscriptionStatus.CLOSED
    assert db.scalars(select(Invoice)).all() == []


def test_one_failure_does_not_stop_the_batch(db, monkeypatch) -> None:
    failing, _, _ = _billed_subscription(db)
    succeeding, _, _ = _billed_subscription(db)

    original = billing.build_invoice_draft

    def flaky_builder(subscription, today, discounts=()):
        if subscription.id == failing.id:
            raise RuntimeError("boom")
        return original(subscription, today, discounts)

    monkeypatch.setattr(billing, "build_invoice_draft", flaky_builder)

    result = run_billing(db, today=TODAY)

    assert result.created_count == 1
    assert result.failed_count == 1
    assert result.created[0].subscription_id == succeeding.id
    assert "boom" in result.failed[0].reason
    assert len(db.scalars(select(Invoice)).all()) == 1

    db.refresh(failing)
    assert failing.next_billing_date == TODAY


def test_selected_subscription_ids_only_bill_those_rows(db) -> None:
    first, _, _ = _billed_subscription(db)
    second, _, _ = _billed_subscription(db)

    result = run_billing(db, subscription_ids=[second.id], today=TODAY)

    assert result.created_count == 1
    assert result.created[0].subscription_id == second.id
    invoices = db.scalars(select(Invoice)).all()
    assert [invoice.subscription_id for invoice in invoices] == [second.id]

    db.refresh(first)
    assert first.next_billing_date == TODAY


def test_run_applies_a_discount_and_taxes_the_discounted_amount(db) -> None:
    _billed_subscription(db)
    rule = make_discount(db, type=ValueType.PERCENT, value=Decimal("10.00"))

    run_billing(db, today=TODAY)

    invoice = db.scalars(select(Invoice)).one()
    assert invoice.subtotal == Decimal("200.00")
    assert invoice.discount_total == Decimal("20.00")
    assert invoice.tax_total == Decimal("36.00")  # 20% of (200 - 20)
    assert invoice.total == Decimal("216.00")

    lines = db.scalars(select(InvoiceLine).order_by(InvoiceLine.id)).all()
    assert len(lines) == 2
    product_line = next(line for line in lines if line.line_type == InvoiceLineType.PRODUCT)
    discount_line = next(line for line in lines if line.line_type == InvoiceLineType.DISCOUNT)
    assert product_line.tax_amount == Decimal("36.00")
    assert discount_line.discount_rule_id == rule.id
    assert discount_line.description == "Ten percent"
    assert discount_line.quantity == 1
    assert discount_line.unit_price == Decimal("-20.00")
    assert discount_line.line_total == Decimal("-20.00")
    assert discount_line.tax_amount == Decimal("0.00")


def test_exhausted_discount_usage_is_not_applied_to_the_next_invoice(db) -> None:
    _billed_subscription(db)
    make_discount(db, type=ValueType.PERCENT, value=Decimal("10.00"), usage_limit=1)

    first = run_billing(db, today=TODAY)
    second = run_billing(db, today=date(2026, 3, 31))

    assert first.created_count == 1
    assert second.created_count == 1

    invoices = db.scalars(select(Invoice).order_by(Invoice.id)).all()
    assert [invoice.discount_total for invoice in invoices] == [
        Decimal("20.00"),
        Decimal("0.00"),
    ]
    discount_lines = db.scalars(
        select(InvoiceLine).where(InvoiceLine.line_type == InvoiceLineType.DISCOUNT)
    ).all()
    assert len(discount_lines) == 1


def _two_product_subscription(db):
    customer = make_customer(db)
    tax = make_tax(db, value=Decimal("20.00"))
    widget = make_product(db, name="Widget", tax=tax)
    gadget = make_product(db, name="Gadget", tax=tax)
    plan = make_plan(db)
    subscription = make_subscription(
        db,
        customer=customer,
        plan=plan,
        lines=[(widget, 2, Decimal("100.00")), (gadget, 2, Decimal("50.00"))],
        next_billing_date=TODAY,
    )
    return subscription, widget, gadget


def test_product_scoped_discount_only_reduces_matching_product_lines(db) -> None:
    _, _, gadget = _two_product_subscription(db)
    make_discount(
        db,
        name="Half off Gadget",
        type=ValueType.PERCENT,
        value=Decimal("50.00"),
        scope=DiscountScope.PRODUCT,
        product=gadget,
    )

    run_billing(db, today=TODAY)

    invoice = db.scalars(select(Invoice)).one()
    assert invoice.subtotal == Decimal("300.00")
    assert invoice.discount_total == Decimal("50.00")
    assert invoice.tax_total == Decimal("50.00")  # 40 on Widget + 10 on Gadget
    assert invoice.total == Decimal("300.00")

    lines = db.scalars(select(InvoiceLine).order_by(InvoiceLine.id)).all()
    taxes = {
        line.description: line.tax_amount
        for line in lines
        if line.line_type == InvoiceLineType.PRODUCT
    }
    assert taxes == {"Widget": Decimal("40.00"), "Gadget": Decimal("10.00")}
    discount_line = next(line for line in lines if line.line_type == InvoiceLineType.DISCOUNT)
    assert discount_line.line_total == Decimal("-50.00")


def test_product_scoped_fixed_discount_cannot_exceed_product_lines(db) -> None:
    _, _, gadget = _two_product_subscription(db)
    make_discount(
        db,
        name="Huge Gadget discount",
        type=ValueType.FIXED,
        value=Decimal("500.00"),
        scope=DiscountScope.PRODUCT,
        product=gadget,
    )

    run_billing(db, today=TODAY)

    invoice = db.scalars(select(Invoice)).one()
    # Gadget is worth 100, so only 100 of the 500 discount can be applied.
    assert invoice.subtotal == Decimal("300.00")
    assert invoice.discount_total == Decimal("100.00")
    assert invoice.tax_total == Decimal("40.00")  # Widget only; Gadget is free
    assert invoice.total == Decimal("240.00")

    lines = db.scalars(select(InvoiceLine).order_by(InvoiceLine.id)).all()
    gadget_line = next(line for line in lines if line.description == "Gadget")
    assert gadget_line.tax_amount == Decimal("0.00")
    discount_line = next(line for line in lines if line.line_type == InvoiceLineType.DISCOUNT)
    assert discount_line.line_total == Decimal("-100.00")
