from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.models import Customer, UserRole
from tests.conftest import PASSWORD


def _login(client: TestClient, email: str):
    return client.post("/auth/login", json={"email": email, "password": PASSWORD})


@pytest.fixture
def staff(client, make_user):
    user = make_user("staff@example.com", UserRole.STAFF)
    _login(client, user.email)
    return user


def _body(email="acme@example.com", **extra):
    return {"name": "Acme", "email": email, **extra}


@pytest.mark.parametrize("role", [None, UserRole.CUSTOMER])
def test_back_office_routes_are_closed(client, make_user, role) -> None:
    if role:
        make_user("c@example.com", role, with_customer=True)
        _login(client, "c@example.com")
    expected = 403 if role else 401
    assert client.get("/customers").status_code == expected
    assert client.post("/customers", json=_body()).status_code == expected
    assert client.get("/customers/1").status_code == expected
    assert client.patch("/customers/1", json={"name": "x"}).status_code == expected


def test_create_get_and_list(client, staff) -> None:
    res = client.post("/customers", json=_body(company="  Acme Inc ", phone=" "))
    assert res.status_code == 201
    body = res.json()
    assert body["company"] == "Acme Inc" and body["phone"] is None
    assert Decimal(body["outstanding_balance"]) == 0
    assert client.get(f"/customers/{body['id']}").json()["email"] == "acme@example.com"
    client.post("/customers", json=_body("zed@example.com", name="Zed"))
    listing = client.get("/customers").json()
    assert listing["total"] == 2 and [i["name"] for i in listing["items"]] == ["Acme", "Zed"]
    found = client.get("/customers", params={"search": "zed"}).json()
    assert [i["email"] for i in found["items"]] == ["zed@example.com"]


def test_create_duplicate_email(client, staff) -> None:
    client.post("/customers", json=_body())
    res = client.post("/customers", json=_body("ACME@example.com"))
    assert res.status_code == 409 and "email" in res.json()["error"]["fields"]


def test_create_validation(client, staff) -> None:
    res = client.post("/customers", json={"name": " ", "email": "nope"})
    assert res.status_code == 422
    assert {"name", "email"} <= set(res.json()["error"]["fields"])


def test_create_links_existing_user(client, make_user, staff, db) -> None:
    user = make_user("later@example.com", UserRole.CUSTOMER)
    res = client.post("/customers", json=_body("later@example.com"))
    assert res.json()["user_id"] == user.id


def test_update_partial_and_conflicts(client, staff) -> None:
    a = client.post("/customers", json=_body()).json()
    client.post("/customers", json=_body("b@example.com", name="B"))
    res = client.patch(f"/customers/{a['id']}", json={"phone": "123"})
    assert res.status_code == 200 and res.json()["phone"] == "123" and res.json()["name"] == "Acme"
    assert client.patch(f"/customers/{a['id']}", json={"email": "b@example.com"}).status_code == 409
    assert client.patch(f"/customers/{a['id']}", json={"name": None}).status_code == 422
    assert client.patch("/customers/999", json={"name": "x"}).status_code == 404
    assert client.get("/customers/999").status_code == 404


def test_customer_me_is_isolated(client, make_user, db) -> None:
    make_user("one@example.com", with_customer=True)
    make_user("two@example.com", with_customer=True)
    _login(client, "one@example.com")
    assert client.get("/customers/me").json()["email"] == "one@example.com"
    res = client.patch("/customers/me", json={"phone": "555", "email": "hack@example.com"})
    assert res.status_code == 200 and res.json()["phone"] == "555"
    assert res.json()["email"] == "one@example.com"
    other = db.query(Customer).filter_by(email="two@example.com").one()
    assert other.phone is None
