"""Customer isolation on listings, the overdue filter and the dashboard summary."""

import time
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert

from app.models import (
    BillingPeriod,
    Customer,
    Invoice,
    InvoiceStatus,
    Payment,
    PaymentMethod,
    Subscription,
    SubscriptionStatus,
    UserRole,
)
from tests.billing_factories import make_customer, make_plan, make_product, make_subscription
from tests.conftest import PASSWORD

TODAY = date.today()


def _login(client: TestClient, email: str) -> None:
    res = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text


def _invoice(db, sub, *, number, status, total="100.00", paid="0.00", due=None, issue=None, period_start=None):
    issue = issue or TODAY
    inv = Invoice(
        number=number,
        subscription_id=sub.id,
        customer_id=sub.customer_id,
        period_start=period_start or issue,
        period_end=(period_start or issue) + timedelta(days=29),
        status=status,
        issue_date=issue,
        due_date=due or issue + timedelta(days=15),
        subtotal=Decimal(total),
        discount_total=Decimal("0"),
        tax_total=Decimal("0"),
        total=Decimal(total),
        amount_paid=Decimal(paid),
    )
    db.add(inv)
    db.flush()
    return inv


@pytest.fixture
def two_customers(db, make_user):
    make_user("alice@example.com", UserRole.CUSTOMER, with_customer=True)
    make_user("bob@example.com", UserRole.CUSTOMER, with_customer=True)
    make_user("staff@example.com", UserRole.STAFF)
    alice = db.query(Customer).filter_by(email="alice@example.com").one()
    bob = db.query(Customer).filter_by(email="bob@example.com").one()
    plan = make_plan(db)
    product = make_product(db)
    sub_a = make_subscription(db, customer=alice, plan=plan, lines=[(product, 1, Decimal("100.00"))])
    sub_b = make_subscription(db, customer=bob, plan=plan, lines=[(product, 2, Decimal("50.00"))])
    inv_a = _invoice(db, sub_a, number="INV-A1", status=InvoiceStatus.CONFIRMED,
                     issue=TODAY - timedelta(days=40), due=TODAY - timedelta(days=10),
                     period_start=TODAY - timedelta(days=40))
    _invoice(db, sub_a, number="INV-A2", status=InvoiceStatus.DRAFT, period_start=TODAY)
    inv_b = _invoice(db, sub_b, number="INV-B1", status=InvoiceStatus.CONFIRMED)
    db.add(Payment(invoice_id=inv_b.id, customer_id=bob.id, method=PaymentMethod.CASH,
                   amount=Decimal("40.00"), payment_date=TODAY))
    inv_b.amount_paid = Decimal("40.00")
    db.commit()
    return {"alice": alice, "bob": bob, "sub_a": sub_a, "sub_b": sub_b, "inv_a": inv_a, "inv_b": inv_b}


# ── Customer isolation ───────────────────────────────────────────────────

def test_customer_lists_only_own_non_draft_invoices(client, two_customers):
    _login(client, "alice@example.com")
    res = client.get("/invoices")
    assert res.status_code == 200
    numbers = [i["number"] for i in res.json()["items"]]
    assert numbers == ["INV-A1"]

    # Passing another customer's id does not widen the scope.
    res = client.get("/invoices", params={"customer_id": two_customers["bob"].id})
    assert [i["number"] for i in res.json()["items"]] == ["INV-A1"]


def test_customer_cannot_read_other_customers_invoice(client, two_customers):
    _login(client, "alice@example.com")
    assert client.get(f"/invoices/{two_customers['inv_b'].id}").status_code == 403


def test_customer_lists_only_own_payments(client, two_customers):
    _login(client, "alice@example.com")
    assert client.get("/payments").json()["total"] == 0
    _login(client, "bob@example.com")
    items = client.get("/payments").json()["items"]
    assert len(items) == 1 and items[0]["invoice_number"] == "INV-B1"


def test_customer_lists_only_own_subscriptions(client, two_customers):
    _login(client, "bob@example.com")
    res = client.get("/subscriptions", params={"customer_id": two_customers["alice"].id})
    ids = [s["id"] for s in res.json()["items"]]
    assert ids == [two_customers["sub_b"].id]
    assert client.get(f"/subscriptions/{two_customers['sub_a'].id}").status_code == 404


def test_staff_sees_all_invoices(client, two_customers):
    _login(client, "staff@example.com")
    assert client.get("/invoices").json()["total"] == 3


def test_overdue_filter(client, two_customers):
    _login(client, "staff@example.com")
    items = client.get("/invoices", params={"overdue": "true"}).json()["items"]
    assert [i["number"] for i in items] == ["INV-A1"]


# ── Dashboard summary ────────────────────────────────────────────────────

def test_summary_requires_staff(client, two_customers):
    _login(client, "alice@example.com")
    assert client.get("/reports/summary").status_code == 403


def test_summary_figures(client, two_customers):
    _login(client, "staff@example.com")
    res = client.get("/reports/summary", params={"date_from": (TODAY - timedelta(days=60)).isoformat(),
                                                 "date_to": TODAY.isoformat()})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["active_subscriptions"] == 2
    assert Decimal(body["mrr"]) == Decimal("200.00")
    assert Decimal(body["revenue_collected"]) == Decimal("40.00")
    assert Decimal(body["invoiced_total"]) == Decimal("200.00")  # draft excluded
    assert body["outstanding_count"] == 2
    assert Decimal(body["outstanding_amount"]) == Decimal("160.00")
    assert body["overdue_count"] == 1
    assert Decimal(body["overdue_amount"]) == Decimal("100.00")
    [overdue] = body["overdue_invoices"]
    assert overdue["number"] == "INV-A1" and overdue["days_overdue"] == 10
    assert len(body["revenue_by_month"]) == 6
    assert body["revenue_by_month"][-1]["month"] == TODAY.strftime("%Y-%m")


def test_summary_date_filter_excludes_out_of_range_payments(client, two_customers):
    _login(client, "staff@example.com")
    past = TODAY - timedelta(days=400)
    body = client.get("/reports/summary", params={"date_from": past.isoformat(),
                                                  "date_to": (past + timedelta(days=5)).isoformat()}).json()
    assert Decimal(body["revenue_collected"]) == 0
    assert Decimal(body["invoiced_total"]) == 0


def test_summary_rejects_inverted_range(client, two_customers):
    _login(client, "staff@example.com")
    res = client.get("/reports/summary", params={"date_from": "2026-02-01", "date_to": "2026-01-01"})
    assert res.status_code == 422


def test_summary_mrr_normalises_yearly_plans(client, db, make_user):
    make_user("staff@example.com", UserRole.STAFF)
    customer = make_customer(db)
    yearly = make_plan(db, name="Yearly", billing_period=BillingPeriod.YEARLY)
    make_subscription(db, customer=customer, plan=yearly, lines=[(make_product(db), 1, Decimal("1200.00"))])
    make_subscription(db, customer=customer, plan=yearly, lines=[(make_product(db, name="x"), 1, Decimal("999"))],
                      status=SubscriptionStatus.CLOSED)
    db.commit()
    _login(client, "staff@example.com")
    assert Decimal(client.get("/reports/summary").json()["mrr"]) == Decimal("100.00")


def test_summary_is_fast_with_thousands_of_rows(client, db, make_user):
    make_user("staff@example.com", UserRole.STAFF)
    customer = make_customer(db)
    plan = make_plan(db)
    template = make_subscription(db, customer=customer, plan=plan, lines=[(make_product(db), 1, Decimal("10"))])
    db.execute(insert(Subscription), [
        {"number": f"SUB-P{i}", "customer_id": customer.id, "plan_id": plan.id,
         "status": SubscriptionStatus.ACTIVE, "start_date": TODAY, "payment_terms_days": 15}
        for i in range(3000)
    ])
    db.execute(insert(Invoice), [
        {"number": f"INV-P{i}", "subscription_id": template.id, "customer_id": customer.id,
         "period_start": TODAY - timedelta(days=i), "period_end": TODAY - timedelta(days=i),
         "status": InvoiceStatus.CONFIRMED, "issue_date": TODAY - timedelta(days=i),
         "due_date": TODAY - timedelta(days=i - 15), "subtotal": 10, "discount_total": 0,
         "tax_total": 0, "total": 10, "amount_paid": 0}
        for i in range(5000)
    ])
    db.commit()
    _login(client, "staff@example.com")
    started = time.perf_counter()
    res = client.get("/reports/summary")
    elapsed = time.perf_counter() - started
    assert res.status_code == 200
    assert res.json()["active_subscriptions"] == 3001
    assert elapsed < 2.0, f"summary took {elapsed:.2f}s"


# ── Invoice actions (regression: FOR UPDATE + outer join used to 500) ───

def test_confirm_send_and_cancel_invoice(client, db, two_customers):
    draft = db.query(Invoice).filter_by(number="INV-A2").one()
    _login(client, "staff@example.com")

    res = client.post(f"/invoices/{draft.id}/confirm")
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "confirmed"
    assert res.json()["subscription_number"] == two_customers["sub_a"].number
    assert client.post(f"/invoices/{draft.id}/confirm").status_code == 400

    assert client.post(f"/invoices/{draft.id}/send").status_code == 200

    res = client.post(f"/invoices/{draft.id}/cancel")
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "cancelled"
    assert client.post(f"/invoices/{draft.id}/cancel").status_code == 400


def test_cannot_cancel_invoice_with_payments(client, two_customers):
    _login(client, "staff@example.com")
    res = client.post(f"/invoices/{two_customers['inv_b'].id}/cancel")
    assert res.status_code == 400
    assert "payments" in res.json()["error"]["message"]


def test_customer_cannot_confirm_or_list_summary(client, two_customers):
    _login(client, "alice@example.com")
    assert client.post(f"/invoices/{two_customers['inv_a'].id}/confirm").status_code == 403
    assert client.post(f"/invoices/{two_customers['inv_a'].id}/cancel").status_code == 403


def test_payment_method_filter_and_total(client, two_customers):
    _login(client, "staff@example.com")
    body = client.get("/payments", params={"method": "cash"}).json()
    assert body["total"] == 1 and Decimal(str(body["amount_total"])) == Decimal("40.00")
    body = client.get("/payments", params={"method": "card"}).json()
    assert body["total"] == 0 and Decimal(str(body["amount_total"])) == 0
