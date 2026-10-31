import pytest
from fastapi.testclient import TestClient

from app.models import UserRole
from tests.conftest import PASSWORD


def _login(client: TestClient, email: str):
    return client.post("/auth/login", json={"email": email, "password": PASSWORD})


@pytest.fixture
def admin(client: TestClient, make_user):
    user = make_user("admin@example.com", UserRole.ADMIN)
    _login(client, user.email)
    return user


TAX = {"name": "GST 18%", "type": "percent", "value": "18"}
PLAN = {
    "name": "Monthly",
    "price": "49.00",
    "billing_period": "monthly",
    "available_from": "2026-01-01",
}


def test_access_rules(client: TestClient, make_user) -> None:
    assert client.get("/taxes").status_code == 401
    make_user("staff@example.com", UserRole.STAFF)
    _login(client, "staff@example.com")
    for path in ("/taxes", "/products", "/plans", "/discounts"):
        assert client.get(path).status_code == 200
    assert client.post("/taxes", json=TAX).status_code == 403
    assert client.post("/plans", json=PLAN).status_code == 403
    product = {"name": "Seat", "type": "service", "sales_price": "10.00"}
    assert client.post("/products", json=product).status_code == 403
    discount = {"name": "Promo", "type": "percent", "value": "10", "start_date": "2026-01-01"}
    assert client.post("/discounts", json=discount).status_code == 403
    assert client.post("/staff", json={"email": "s2@example.com", "full_name": "S2"}).status_code == 403


def test_customer_cannot_read(client: TestClient, make_user) -> None:
    make_user("c@example.com", UserRole.CUSTOMER, with_customer=True)
    _login(client, "c@example.com")
    assert client.get("/plans").status_code == 403


def test_tax_crud_and_validation(client: TestClient, admin) -> None:
    r = client.post("/taxes", json=TAX)
    assert r.status_code == 201
    tax_id = r.json()["id"]
    assert client.post("/taxes", json={**TAX, "value": "101"}).status_code == 422
    assert client.post("/taxes", json={**TAX, "name": "  "}).status_code == 422
    r = client.patch(f"/taxes/{tax_id}", json={**TAX, "is_active": False})
    assert r.json()["is_active"] is False
    assert client.delete(f"/taxes/{tax_id}").status_code == 204
    assert client.delete(f"/taxes/{tax_id}").status_code == 404


def test_product_variants_and_tax(client: TestClient, admin) -> None:
    tax_id = client.post("/taxes", json=TAX).json()["id"]
    body = {
        "name": "CRM",
        "type": "Software",
        "sales_price": "49",
        "tax_id": tax_id,
        "variants": [
            {"attribute": "Edition", "value": "Pro", "extra_price": "30"},
            {"attribute": "Edition", "value": "Ent", "extra_price": "90"},
        ],
    }
    r = client.post("/products", json=body)
    assert r.status_code == 201, r.text
    product = r.json()
    assert product["tax"]["name"] == "GST 18%"
    assert len(product["variants"]) == 2
    ids = {v["value"]: v["id"] for v in product["variants"]}

    # Update keeps ids of surviving variants, drops removed, adds new.
    body["variants"] = [
        {"attribute": "Edition", "value": "Pro", "extra_price": "35"},
        {"attribute": "Edition", "value": "Std", "extra_price": "0"},
    ]
    r = client.patch(f"/products/{product['id']}", json=body).json()
    by_value = {v["value"]: v for v in r["variants"]}
    assert set(by_value) == {"Pro", "Std"}
    assert by_value["Pro"]["id"] == ids["Pro"]
    assert float(by_value["Pro"]["extra_price"]) == 35

    dup = {**body, "variants": [body["variants"][0], body["variants"][0]]}
    assert client.patch(f"/products/{product['id']}", json=dup).status_code == 422
    assert client.post("/products", json={**body, "tax_id": 9999}).status_code == 422
    assert client.delete(f"/products/{product['id']}").status_code == 204


def test_plan_crud_and_date_validation(client: TestClient, admin) -> None:
    r = client.post("/plans", json=PLAN)
    assert r.status_code == 201
    assert r.json()["billing_period"] == "monthly"
    assert client.post("/plans", json={**PLAN, "available_to": "2025-01-01"}).status_code == 422
    assert client.post("/plans", json={**PLAN, "min_quantity": 0}).status_code == 422
    r = client.patch(f"/plans/{r.json()['id']}", json={**PLAN, "auto_close": True})
    assert r.json()["auto_close"] is True
    assert len(client.get("/plans").json()) == 1


def test_discount_rules(client: TestClient, admin) -> None:
    product_id = client.post(
        "/products", json={"name": "P", "type": "Service", "sales_price": "10"}
    ).json()["id"]
    base = {"name": "Promo", "type": "percent", "value": "10", "start_date": "2026-01-01", "scope": "subscription"}
    r = client.post("/discounts", json={**base, "product_id": product_id})
    assert r.status_code == 201
    assert r.json()["product_id"] is None  # ignored for subscription scope
    assert r.json()["times_used"] == 0

    r = client.post("/discounts", json={**base, "scope": "product", "product_id": product_id})
    assert r.json()["product_name"] == "P"
    assert client.post("/discounts", json={**base, "scope": "product"}).status_code == 422
    assert client.post("/discounts", json={**base, "value": "0"}).status_code == 422
    assert client.post("/discounts", json={**base, "value": "150"}).status_code == 422
    assert client.post("/discounts", json={**base, "end_date": "2025-01-01"}).status_code == 422

    # A product used by a discount rule cannot be deleted.
    assert client.delete(f"/products/{product_id}").status_code == 409
