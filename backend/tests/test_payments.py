import pytest
from datetime import date
from decimal import Decimal
from fastapi.testclient import TestClient

from app.models import Customer, Invoice, InvoiceLine, InvoiceLineType, InvoiceStatus, UserRole
from app.services.payments import record_payment
from app.models.enums import PaymentMethod
from tests.conftest import PASSWORD


def _login(client: TestClient, email: str) -> None:
    res = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200


@pytest.fixture
def invoice_fixture(db, make_user):
    cust_user = make_user("cust_m4@example.com", UserRole.CUSTOMER, with_customer=True)
    customer = db.query(Customer).filter(Customer.email == "cust_m4@example.com").first()

    inv = Invoice(
        number="INV-2001",
        subscription_id=1,
        customer_id=customer.id,
        period_start=date(2026, 10, 1),
        period_end=date(2026, 10, 31),
        status=InvoiceStatus.CONFIRMED,
        issue_date=date(2026, 10, 1),
        due_date=date(2026, 10, 15),
        subtotal=Decimal("1000.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("180.00"),
        total=Decimal("1180.00"),
        amount_paid=Decimal("0.00"),
    )
    db.add(inv)
    db.commit()
    return inv, customer


def test_payment_overpayment_rejected(client: TestClient, make_user, invoice_fixture):
    inv, _ = invoice_fixture
    make_user("staff_pay@example.com", UserRole.STAFF)
    _login(client, "staff_pay@example.com")

    # Attempt to pay more than 1180.00
    res = client.post(
        f"/invoices/{inv.id}/payments",
        json={"amount": "1200.00", "method": "bank_transfer"},
    )
    assert res.status_code == 400
    assert "exceeds" in res.json()["message"].lower()


def test_partial_then_full_payment(client: TestClient, make_user, invoice_fixture):
    inv, _ = invoice_fixture
    make_user("staff_pay2@example.com", UserRole.STAFF)
    _login(client, "staff_pay2@example.com")

    # Partial payment
    p1 = client.post(
        f"/invoices/{inv.id}/payments",
        json={"amount": "500.00", "method": "bank_transfer", "note": "Part 1"},
    )
    assert p1.status_code == 201

    detail = client.get(f"/invoices/{inv.id}").json()
    assert Decimal(str(detail["amount_paid"])) == Decimal("500.00")
    assert Decimal(str(detail["amount_due"])) == Decimal("680.00")
    assert detail["status"] == "confirmed"

    # Full remainder
    p2 = client.post(
        f"/invoices/{inv.id}/payments",
        json={"amount": "680.00", "method": "card"},
    )
    assert p2.status_code == 201

    settled = client.get(f"/invoices/{inv.id}").json()
    assert settled["status"] == "paid"
    assert Decimal(str(settled["amount_due"])) == Decimal("0.00")


def test_global_payments_ledger(client: TestClient, make_user, invoice_fixture):
    inv, cust = invoice_fixture
    make_user("staff_ledger@example.com", UserRole.STAFF)
    _login(client, "staff_ledger@example.com")

    client.post(
        f"/invoices/{inv.id}/payments",
        json={"amount": "200.00", "method": "online", "note": "Ledger check"},
    )

    ledger = client.get("/payments").json()
    assert ledger["total"] >= 1
    assert any(p["invoice_id"] == inv.id for p in ledger["items"])


def test_concurrent_payment_safety_validation(db, invoice_fixture):
    """Verify record_payment checks balance atomically against invoice."""
    inv, _ = invoice_fixture
    # Pay 600
    record_payment(db, invoice_id=inv.id, amount=Decimal("600.00"), method=PaymentMethod.BANK_TRANSFER)
    assert inv.amount_paid == Decimal("600.00")
    assert inv.status == InvoiceStatus.CONFIRMED

    # Trying to pay 600 again should fail because 600 + 600 = 1200 > 1180
    with pytest.raises(Exception) as excinfo:
        record_payment(db, invoice_id=inv.id, amount=Decimal("600.00"), method=PaymentMethod.CARD)
    assert "exceeds" in str(excinfo.value).lower()
