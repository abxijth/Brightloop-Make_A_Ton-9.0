import pytest
from fastapi.testclient import TestClient

from app.models import EmailType, Outbox, UserRole
from tests.conftest import PASSWORD


def _login(client: TestClient, email: str) -> None:
    assert client.post("/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200


@pytest.fixture
def emails(db):
    rows = [
        Outbox(type=EmailType.PASSWORD_RESET, to_email="a@example.com", subject="Reset A",
               body_html='<a href="http://x/reset-password?token=t1">Reset</a>'),
        Outbox(type=EmailType.INVOICE, to_email="b@example.com", subject="Invoice INV-0001",
               body_html="<p>Invoice</p>"),
        Outbox(type=EmailType.PASSWORD_RESET, to_email="c@example.com", subject="Reset C",
               body_html="<p>C</p>"),
    ]
    db.add_all(rows)
    db.commit()
    return rows


def test_requires_login(client: TestClient) -> None:
    assert client.get("/outbox").status_code == 401


def test_customer_forbidden(client: TestClient, make_user) -> None:
    make_user("cust@example.com", UserRole.CUSTOMER, with_customer=True)
    _login(client, "cust@example.com")
    assert client.get("/outbox").status_code == 403
    assert client.get("/outbox/1").status_code == 403


@pytest.mark.parametrize("role", [UserRole.STAFF, UserRole.ADMIN])
def test_staff_and_admin_can_list(client: TestClient, make_user, emails, role) -> None:
    make_user("s@example.com", role)
    _login(client, "s@example.com")
    body = client.get("/outbox").json()
    assert body["total"] == 3
    assert [i["subject"] for i in body["items"]] == ["Reset C", "Invoice INV-0001", "Reset A"]
    assert "body_html" not in body["items"][0]


def test_pagination_filter_and_search(client: TestClient, make_user, emails) -> None:
    make_user("s@example.com", UserRole.STAFF)
    _login(client, "s@example.com")
    page = client.get("/outbox", params={"page": 2, "page_size": 2}).json()
    assert page["total"] == 3 and len(page["items"]) == 1
    only = client.get("/outbox", params={"type": "invoice"}).json()
    assert only["total"] == 1 and only["items"][0]["to_email"] == "b@example.com"
    found = client.get("/outbox", params={"search": "reset a"}).json()
    assert found["total"] == 1


def test_detail_returns_body_with_link(client: TestClient, make_user, emails) -> None:
    make_user("s@example.com", UserRole.ADMIN)
    _login(client, "s@example.com")
    row = client.get(f"/outbox/{emails[0].id}").json()
    assert "reset-password?token=t1" in row["body_html"]
    missing = client.get("/outbox/9999")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_found"


def test_forgot_password_shows_up_in_outbox(client: TestClient, make_user) -> None:
    make_user("cust@example.com", UserRole.CUSTOMER, with_customer=True)
    make_user("admin@example.com", UserRole.ADMIN)
    client.post("/auth/forgot-password", json={"email": "cust@example.com"})
    _login(client, "admin@example.com")
    items = client.get("/outbox").json()["items"]
    assert items[0]["type"] == "password_reset" and items[0]["to_email"] == "cust@example.com"
