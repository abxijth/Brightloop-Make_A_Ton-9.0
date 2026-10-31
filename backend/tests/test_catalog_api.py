
from fastapi.testclient import TestClient

from app.models import UserRole
from tests.conftest import PASSWORD


def _login(client: TestClient, email: str) -> None:
    res = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200


def test_taxes_endpoints(client: TestClient, make_user):
    admin = make_user("admin_tax@example.com", UserRole.ADMIN)
    staff = make_user("staff_tax@example.com", UserRole.STAFF)

    # 1. Unauthenticated or staff rejected
    res = client.get("/taxes")
    assert res.status_code == 401

    _login(client, staff.email)
    res = client.get("/taxes")
    assert res.status_code == 403

    # 2. Admin can create and list taxes
    _login(client, admin.email)
    create_res = client.post(
        "/taxes",
        json={"name": "VAT 10%", "type": "percent", "value": "10.00", "is_active": True},
    )
    assert create_res.status_code == 201
    tax_data = create_res.json()
    tax_id = tax_data["id"]
    assert tax_data["name"] == "VAT 10%"
    assert tax_data["value"] == "10.00"

    list_res = client.get("/taxes")
    assert list_res.status_code == 200
    assert any(t["id"] == tax_id for t in list_res.json()["items"])

    # 3. Update tax
    update_res = client.put(f"/taxes/{tax_id}", json={"name": "Standard VAT 10%"})
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Standard VAT 10%"


def test_products_and_variants_endpoints(client: TestClient, make_user):
    admin = make_user("admin_prod@example.com", UserRole.ADMIN)
    _login(client, admin.email)

    # Create a tax first
    tax_res = client.post(
        "/taxes",
        json={"name": "GST 5%", "type": "percent", "value": "5.00"},
    )
    tax_id = tax_res.json()["id"]

    # Create product with inline variants
    prod_payload = {
        "name": "Cloud Hosting",
        "type": "service",
        "sales_price": "500.00",
        "tax_id": tax_id,
        "variants": [
            {"attribute": "RAM", "value": "16GB", "extra_price": "200.00"},
            {"attribute": "Storage", "value": "1TB SSD", "extra_price": "150.00"},
        ],
    }
    create_res = client.post("/products", json=prod_payload)
    assert create_res.status_code == 201
    prod = create_res.json()
    assert prod["name"] == "Cloud Hosting"
    assert len(prod["variants"]) == 2
    assert prod["tax"]["name"] == "GST 5%"

    prod_id = prod["id"]

    # Get single product
    get_res = client.get(f"/products/{prod_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == prod_id

    # Update product and replace variants
    update_res = client.put(
        f"/products/{prod_id}",
        json={
            "sales_price": "550.00",
            "variants": [{"attribute": "RAM", "value": "32GB", "extra_price": "400.00"}],
        },
    )
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["sales_price"] == "550.00"
    assert len(updated["variants"]) == 1
    assert updated["variants"][0]["value"] == "32GB"


def test_plans_endpoints(client: TestClient, make_user):
    admin = make_user("admin_plan@example.com", UserRole.ADMIN)
    _login(client, admin.email)

    plan_payload = {
        "name": "Enterprise Annual",
        "price": "12000.00",
        "billing_period": "yearly",
        "min_quantity": 1,
        "available_from": "2026-01-01",
        "available_to": "2026-12-31",
        "auto_close": True,
        "allow_early_close": False,
        "is_active": True,
    }
    create_res = client.post("/plans", json=plan_payload)
    assert create_res.status_code == 201
    plan = create_res.json()
    assert plan["billing_period"] == "yearly"
    assert plan["auto_close"] is True

    plan_id = plan["id"]
    list_res = client.get("/plans")
    assert list_res.status_code == 200
    assert any(p["id"] == plan_id for p in list_res.json()["items"])

    # Update plan
    up_res = client.put(f"/plans/{plan_id}", json={"allow_early_close": True})
    assert up_res.status_code == 200
    assert up_res.json()["allow_early_close"] is True


def test_discounts_endpoints(client: TestClient, make_user):
    admin = make_user("admin_disc@example.com", UserRole.ADMIN)
    _login(client, admin.email)

    rule_payload = {
        "name": "SUMMER10",
        "type": "percent",
        "value": "10.00",
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "usage_limit": 50,
        "scope": "subscription",
    }
    create_res = client.post("/discounts", json=rule_payload)
    assert create_res.status_code == 201
    disc = create_res.json()
    assert disc["status"] == "active"
    assert disc["used_count"] == 0
    assert disc["usage_limit"] == 50

    disc_id = disc["id"]
    list_res = client.get("/discounts")
    assert list_res.status_code == 200
    assert any(d["id"] == disc_id for d in list_res.json()["items"])

    # Update rule
    up_res = client.put(f"/discounts/{disc_id}", json={"usage_limit": 100})
    assert up_res.status_code == 200
    assert up_res.json()["usage_limit"] == 100


def test_update_can_clear_fields_and_revalidates_merged_state(client: TestClient, make_user):
    admin = make_user("admin_upd@example.com", UserRole.ADMIN)
    _login(client, admin.email)

    plan = client.post(
        "/plans",
        json={"name": "P", "price": "10.00", "billing_period": "monthly",
              "available_from": "2026-03-01", "available_to": "2026-12-31"},
    ).json()
    # explicit null clears
    res = client.put(f"/plans/{plan['id']}", json={"available_to": None})
    assert res.status_code == 200 and res.json()["available_to"] is None
    # only available_to sent, earlier than stored available_from
    res = client.put(f"/plans/{plan['id']}", json={"available_to": "2026-01-01"})
    assert res.status_code == 422

    tax = client.post("/taxes", json={"name": "T", "type": "fixed", "value": "500.00"}).json()
    res = client.put(f"/taxes/{tax['id']}", json={"type": "percent"})
    assert res.status_code == 422

    rule = client.post(
        "/discounts",
        json={"name": "R", "type": "percent", "value": "10", "start_date": "2026-01-01",
              "end_date": "2026-12-31", "usage_limit": 5},
    ).json()
    res = client.put(f"/discounts/{rule['id']}", json={"end_date": None, "usage_limit": None})
    assert res.status_code == 200
    assert res.json()["end_date"] is None and res.json()["usage_limit"] is None
    assert client.put(f"/discounts/{rule['id']}", json={"end_date": "2025-01-01"}).status_code == 422
    # product_id on a subscription-scoped rule is rejected, not ignored
    assert client.put(f"/discounts/{rule['id']}", json={"product_id": 1}).status_code == 422


def test_product_update_keeps_unchanged_variant_ids(client: TestClient, make_user):
    admin = make_user("admin_var@example.com", UserRole.ADMIN)
    _login(client, admin.email)
    prod = client.post(
        "/products",
        json={"name": "H", "sales_price": "5.00",
              "variants": [{"attribute": "RAM", "value": "16GB", "extra_price": "1.00"},
                           {"attribute": "RAM", "value": "32GB", "extra_price": "2.00"}]},
    ).json()
    ids = {v["value"]: v["id"] for v in prod["variants"]}
    res = client.put(
        f"/products/{prod['id']}",
        json={"variants": [{"attribute": "RAM", "value": "16GB", "extra_price": "9.00"}]},
    )
    assert res.status_code == 200
    out = res.json()["variants"]
    assert len(out) == 1 and out[0]["id"] == ids["16GB"] and out[0]["extra_price"] == "9.00"
    dup = client.put(
        f"/products/{prod['id']}",
        json={"variants": [{"attribute": "A", "value": "b"}, {"attribute": "A", "value": "b"}]},
    )
    assert dup.status_code == 422
    assert client.put(f"/products/{prod['id']}", json={"tax_id": None}).status_code == 200
