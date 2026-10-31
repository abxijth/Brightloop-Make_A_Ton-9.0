"""Tests for GET /billing/due and the list_due_subscriptions service."""
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.models.enums import InvoiceStatus, SubscriptionStatus
from app.models.invoice import Invoice
from app.services.billing import list_due_subscriptions
from tests.billing_factories import make_customer, make_plan, make_product, make_subscription
from tests.conftest import PASSWORD

TODAY = date(2026, 10, 31)
FUTURE = date(2027, 3, 1)


def _login(client: TestClient, email: str) -> None:
    r = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Service-level unit tests (no HTTP, just db)
# ---------------------------------------------------------------------------


def _active_sub(db, *, next_billing_date=TODAY, **kw):
    customer = make_customer(db)
    product = make_product(db)
    plan = make_plan(db)
    return make_subscription(
        db,
        customer=customer,
        plan=plan,
        lines=[(product, 2, Decimal("100.00"))],
        next_billing_date=next_billing_date,
        **kw,
    )


def test_list_due_returns_active_due_subscriptions(db) -> None:
    due = _active_sub(db)
    _active_sub(db, next_billing_date=FUTURE)  # not due yet
    _active_sub(db, status=SubscriptionStatus.DRAFT)  # wrong status
    _active_sub(db, status=SubscriptionStatus.CLOSED)  # wrong status

    items = list_due_subscriptions(db, today=TODAY)

    assert len(items) == 1
    assert items[0].subscription_id == due.id


def test_list_due_shows_correct_amounts(db) -> None:
    _active_sub(db)  # 2 × 100 = 200

    items = list_due_subscriptions(db, today=TODAY)

    assert len(items) == 1
    assert items[0].estimated_total == Decimal("200.00")
    assert items[0].period_start == TODAY


def test_already_billed_flag_is_false_before_run(db) -> None:
    _active_sub(db)

    items = list_due_subscriptions(db, today=TODAY)

    assert items[0].already_billed is False


def test_already_billed_flag_is_true_after_invoice_exists(db) -> None:
    sub = _active_sub(db)
    # Insert a fake invoice for the same period to simulate an already-billed state.
    invoice = Invoice(
        number="INV-9999",
        subscription_id=sub.id,
        customer_id=sub.customer_id,
        period_start=TODAY,
        period_end=date(2027, 1, 31),
        status=InvoiceStatus.DRAFT,
        issue_date=TODAY,
        due_date=date(2026, 11, 14),
        subtotal=Decimal("200.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("200.00"),
        amount_paid=Decimal("0.00"),
    )
    db.add(invoice)
    db.flush()

    items = list_due_subscriptions(db, today=TODAY)

    assert items[0].already_billed is True


def test_list_due_includes_customer_and_plan_name(db) -> None:
    _active_sub(db)

    items = list_due_subscriptions(db, today=TODAY)

    assert items[0].customer_name != ""
    assert items[0].plan_name != ""


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


@pytest.fixture
def staff_client(client: TestClient, make_user) -> TestClient:
    from app.models import UserRole
    make_user("staff@example.com", UserRole.STAFF)
    _login(client, "staff@example.com")
    return client


def test_due_endpoint_requires_login(client: TestClient) -> None:
    r = client.get("/billing/due")
    assert r.status_code == 401


def test_due_endpoint_forbidden_for_customer(client: TestClient, make_user) -> None:
    from app.models import UserRole
    make_user("cust@example.com", UserRole.CUSTOMER, with_customer=True)
    _login(client, "cust@example.com")
    r = client.get("/billing/due")
    assert r.status_code == 403


def test_due_endpoint_returns_empty_when_nothing_due(staff_client: TestClient, db) -> None:
    _active_sub(db, next_billing_date=FUTURE)

    r = staff_client.get(f"/billing/due?as_of={TODAY}")

    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 0
    assert body["items"] == []


def test_due_endpoint_lists_due_subscriptions(staff_client: TestClient, db) -> None:
    _active_sub(db, next_billing_date=TODAY)
    _active_sub(db, next_billing_date=FUTURE)

    r = staff_client.get(f"/billing/due?as_of={TODAY}")

    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    item = body["items"][0]
    assert item["estimated_total"] == "200.00"
    assert item["already_billed"] is False
    assert item["period_start"] == str(TODAY)
    assert item["customer_name"] != ""
    assert item["plan_name"] != ""


def test_due_endpoint_already_billed_flag_visible(staff_client: TestClient, db) -> None:
    sub = _active_sub(db, next_billing_date=TODAY)
    # simulate a pre-existing invoice for this period
    invoice = Invoice(
        number="INV-DUP",
        subscription_id=sub.id,
        customer_id=sub.customer_id,
        period_start=TODAY,
        period_end=date(2027, 1, 31),
        status=InvoiceStatus.DRAFT,
        issue_date=TODAY,
        due_date=date(2026, 11, 14),
        subtotal=Decimal("200.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("200.00"),
        amount_paid=Decimal("0.00"),
    )
    db.add(invoice)
    db.flush()

    r = staff_client.get(f"/billing/due?as_of={TODAY}")

    assert r.status_code == 200
    assert r.json()["items"][0]["already_billed"] is True


def test_due_as_of_query_param_changes_the_date(staff_client: TestClient, db) -> None:
    _active_sub(db, next_billing_date=TODAY)  # due on TODAY only

    r_today = staff_client.get(f"/billing/due?as_of={TODAY}")
    r_past = staff_client.get("/billing/due?as_of=2026-01-01")

    assert r_today.json()["count"] == 1
    assert r_past.json()["count"] == 0
