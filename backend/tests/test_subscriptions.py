from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import (
    Customer,
    ProductVariant,
    SubscriptionStatus,
    UserRole,
)
from billing_factories import (
    make_customer,
    make_plan,
    make_product,
    make_subscription,
    make_tax,
    make_template,
)
from tests.conftest import PASSWORD

TODAY = date(2026, 1, 15)


def _login(client: TestClient, email: str) -> None:
    assert (
        client.post("/auth/login", json={"email": email, "password": PASSWORD}).status_code
        == 200
    )


def _as_staff(client: TestClient, make_user, email: str = "staff@example.com") -> None:
    make_user(email, UserRole.STAFF)
    _login(client, email)


def _customer(db, email: str) -> Customer:
    return db.scalar(select(Customer).where(Customer.email == email))


@pytest.fixture
def catalog(db):
    customer = make_customer(db, name="Acme Ltd", email="acme@example.com")
    tax = make_tax(db, name="VAT", value=Decimal("20.00"))
    product = make_product(db, name="Widget", price=Decimal("100.00"), tax=tax)
    plan = make_plan(db, name="Monthly", price=Decimal("100.00"))
    return customer, product, plan, tax


def _sub(db, customer, plan, product, *, status=SubscriptionStatus.DRAFT, **overrides):
    return make_subscription(
        db,
        customer=customer,
        plan=plan,
        lines=[(product, 1, Decimal("100.00"))],
        status=status,
        next_billing_date=overrides.pop("next_billing_date", None),
        **overrides,
    )


def _money(value) -> Decimal:
    return Decimal(str(value))


def test_requires_login(client: TestClient) -> None:
    assert client.get("/subscriptions").status_code == 401
    assert client.get("/subscriptions/1").status_code == 401
    assert client.post("/subscriptions/1/close").status_code == 401


def test_customers_see_only_their_own_subscriptions(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    make_user("owner@example.com", UserRole.CUSTOMER, with_customer=True)
    make_user("other@example.com", UserRole.CUSTOMER, with_customer=True)
    owner = _customer(db, "owner@example.com")
    other = _customer(db, "other@example.com")
    own = _sub(db, owner, plan, product)
    theirs = _sub(db, other, plan, product)

    _login(client, "owner@example.com")
    page = client.get("/subscriptions").json()
    assert page["total"] == 1
    assert page["items"][0]["id"] == own.id
    assert client.get(f"/subscriptions/{theirs.id}").status_code == 404

    _as_staff(client, make_user, "staff@example.com")
    assert client.get("/subscriptions").json()["total"] == 2


def test_customer_cannot_create_or_edit_subscriptions(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    make_user("cust@example.com", UserRole.CUSTOMER, with_customer=True)
    own = db.scalar(select(Customer).where(Customer.email == "cust@example.com"))
    subscription = _sub(db, own, plan, product)
    _login(client, "cust@example.com")

    create = client.post(
        "/subscriptions",
        json={
            "customer_id": customer.id,
            "plan_id": plan.id,
            "start_date": TODAY.isoformat(),
            "lines": [{"product_id": product.id, "quantity": 1}],
        },
    )
    assert create.status_code == 403
    assert client.patch(f"/subscriptions/{subscription.id}", json={"payment_terms_days": 30}).status_code == 403
    assert client.post(
        f"/subscriptions/{subscription.id}/transition",
        json={"target_status": "quotation"},
    ).status_code == 403


def test_staff_can_create_a_blank_subscription(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    _as_staff(client, make_user)

    res = client.post(
        "/subscriptions",
        json={
            "customer_id": customer.id,
            "plan_id": plan.id,
            "start_date": "2026-02-01",
            "payment_terms_days": 15,
            "lines": [{"product_id": product.id, "quantity": 2}],
        },
    )

    assert res.status_code == 201
    body = res.json()
    assert body["number"].startswith("SUB-")
    assert body["status"] == "draft"
    assert body["next_billing_date"] is None
    assert body["customer_name"] == "Acme Ltd"
    assert body["plan_name"] == "Monthly"
    assert body["billing_period"] == "monthly"
    assert body["allowed_transitions"] == ["quotation", "confirmed", "closed"]
    assert body["can_close"] is True
    assert body["lines"][0]["product_name"] == "Widget"
    assert _money(body["lines"][0]["unit_price"]) == Decimal("100.00")
    assert _money(body["lines"][0]["line_total"]) == Decimal("200.00")
    assert _money(body["lines"][0]["tax_amount"]) == Decimal("40.00")
    assert _money(body["subtotal"]) == Decimal("200.00")
    assert _money(body["tax_total"]) == Decimal("40.00")
    assert _money(body["total"]) == Decimal("240.00")


def test_line_price_includes_the_variant_extra(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    variant = ProductVariant(
        product_id=product.id,
        attribute="Brand",
        value="Odoo",
        extra_price=Decimal("560.00"),
    )
    db.add(variant)
    db.flush()
    _as_staff(client, make_user)

    res = client.post(
        "/subscriptions",
        json={
            "customer_id": customer.id,
            "plan_id": plan.id,
            "start_date": "2026-02-01",
            "lines": [
                {"product_id": product.id, "variant_id": variant.id, "quantity": 1}
            ],
        },
    )

    assert res.status_code == 201
    line = res.json()["lines"][0]
    assert line["variant_label"] == "Brand: Odoo"
    assert _money(line["unit_price"]) == Decimal("660.00")


def test_create_from_template_copies_plan_lines_and_validity(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    template = make_template(
        db, plan=plan, lines=[(product, 3)], name="Starter", validity_days=30
    )
    _as_staff(client, make_user)

    res = client.post(
        "/subscriptions",
        json={
            "customer_id": customer.id,
            "template_id": template.id,
            "start_date": "2026-02-01",
        },
    )

    assert res.status_code == 201
    body = res.json()
    assert body["plan_id"] == plan.id
    assert body["lines"][0]["quantity"] == 3
    assert body["expiry_date"] == (date.today() + timedelta(days=30)).isoformat()


def test_templates_are_staff_only(
    client: TestClient, db, make_user, catalog
) -> None:
    _, product, plan, _ = catalog
    make_template(db, plan=plan, lines=[(product, 1)], name="Starter")

    make_user("cust@example.com", UserRole.CUSTOMER, with_customer=True)
    _login(client, "cust@example.com")
    assert client.get("/subscriptions/templates").status_code == 403

    _as_staff(client, make_user, "staff@example.com")
    body = client.get("/subscriptions/templates").json()
    assert [template["name"] for template in body] == ["Starter"]
    assert body[0]["lines"][0]["product_name"] == "Widget"


def test_status_stepper_activates_and_sets_the_first_billing_date(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    subscription = _sub(
        db,
        customer,
        plan,
        product,
        start_date=date(2026, 2, 1),
    )
    _as_staff(client, make_user)

    for target in ("quotation", "confirmed", "active"):
        res = client.post(
            f"/subscriptions/{subscription.id}/transition",
            json={"target_status": target},
        )
        assert res.status_code == 200
        assert res.json()["status"] == target

    assert res.json()["next_billing_date"] == "2026-02-01"
    assert res.json()["allowed_transitions"] == ["closed"]


def test_invalid_transition_is_rejected(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    subscription = _sub(db, customer, plan, product)
    _as_staff(client, make_user)

    res = client.post(
        f"/subscriptions/{subscription.id}/transition",
        json={"target_status": "active"},
    )

    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_transition"


def test_expired_subscription_cannot_be_activated(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    subscription = _sub(
        db,
        customer,
        plan,
        product,
        status=SubscriptionStatus.CONFIRMED,
        start_date=date(2025, 1, 1),
        expiry_date=date(2025, 2, 1),
    )
    _as_staff(client, make_user)

    res = client.post(
        f"/subscriptions/{subscription.id}/transition",
        json={"target_status": "active"},
    )

    assert res.status_code == 400
    assert "expired" in res.json()["error"]["fields"]["target_status"].lower()


def test_staff_can_edit_a_draft_subscription(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    subscription = _sub(db, customer, plan, product)
    _as_staff(client, make_user)

    res = client.patch(
        f"/subscriptions/{subscription.id}",
        json={
            "payment_terms_days": 30,
            "lines": [
                {"product_id": product.id, "quantity": 3, "unit_price": "90.00"}
            ],
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["payment_terms_days"] == 30
    assert body["lines"][0]["quantity"] == 3
    assert _money(body["lines"][0]["unit_price"]) == Decimal("90.00")
    assert _money(body["subtotal"]) == Decimal("270.00")
    assert _money(body["tax_total"]) == Decimal("54.00")
    assert _money(body["total"]) == Decimal("324.00")


def test_active_subscription_cannot_be_edited(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    subscription = _sub(
        db,
        customer,
        plan,
        product,
        status=SubscriptionStatus.ACTIVE,
        next_billing_date=TODAY,
    )
    _as_staff(client, make_user)

    res = client.patch(
        f"/subscriptions/{subscription.id}", json={"payment_terms_days": 30}
    )

    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_status"


def test_start_date_must_be_inside_the_plan_window(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    plan.available_to = date(2026, 12, 31)
    db.flush()
    _as_staff(client, make_user)

    res = client.post(
        "/subscriptions",
        json={
            "customer_id": customer.id,
            "plan_id": plan.id,
            "start_date": "2027-01-01",
            "lines": [{"product_id": product.id, "quantity": 1}],
        },
    )

    assert res.status_code == 400
    assert "start_date" in res.json()["error"]["fields"]


def test_unknown_product_is_rejected(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, _, plan, _ = catalog
    _as_staff(client, make_user)

    res = client.post(
        "/subscriptions",
        json={
            "customer_id": customer.id,
            "plan_id": plan.id,
            "start_date": "2026-02-01",
            "lines": [{"product_id": 9999, "quantity": 1}],
        },
    )

    assert res.status_code == 400
    assert "lines" in res.json()["error"]["fields"]


def test_list_filters_searches_and_paginates(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    other = make_customer(db, name="Beta Corp", email="beta@example.com")
    active = _sub(
        db,
        customer,
        plan,
        product,
        status=SubscriptionStatus.ACTIVE,
        next_billing_date=TODAY,
    )
    draft = _sub(db, other, plan, product)
    _as_staff(client, make_user)

    assert client.get("/subscriptions", params={"status": "active"}).json()["total"] == 1
    assert (
        client.get("/subscriptions", params={"customer_id": other.id})
        .json()["items"][0]["id"]
        == draft.id
    )
    assert (
        client.get("/subscriptions", params={"search": "beta"})
        .json()["items"][0]["id"]
        == draft.id
    )
    assert client.get("/subscriptions", params={"search": active.number}).json()["total"] == 1

    page = client.get(
        "/subscriptions", params={"page": 1, "page_size": 1, "order": "asc"}
    ).json()
    assert page["total"] == 2
    assert len(page["items"]) == 1


def test_staff_can_close_an_active_subscription(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    subscription = _sub(
        db,
        customer,
        plan,
        product,
        status=SubscriptionStatus.ACTIVE,
        next_billing_date=TODAY,
    )
    _as_staff(client, make_user)

    res = client.post(f"/subscriptions/{subscription.id}/close")

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "closed"
    assert body["allowed_transitions"] == []
    assert body["can_close"] is False


def test_customer_can_close_early_only_when_the_plan_allows_it(
    client: TestClient, db, make_user
) -> None:
    make_user("cust@example.com", UserRole.CUSTOMER, with_customer=True)
    customer = _customer(db, "cust@example.com")
    product = make_product(db, name="Widget", price=Decimal("100.00"))
    allowed_plan = make_plan(db, name="Flexible", allow_early_close=True)
    blocked_plan = make_plan(db, name="Fixed", allow_early_close=False)
    allowed = _sub(
        db,
        customer,
        allowed_plan,
        product,
        status=SubscriptionStatus.ACTIVE,
        next_billing_date=TODAY,
    )
    blocked = _sub(
        db,
        customer,
        blocked_plan,
        product,
        status=SubscriptionStatus.ACTIVE,
        next_billing_date=TODAY,
    )
    _login(client, "cust@example.com")

    assert client.post(f"/subscriptions/{allowed.id}/close").status_code == 200
    res = client.post(f"/subscriptions/{blocked.id}/close")
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "not_allowed"


def test_customer_cannot_close_another_customers_subscription(
    client: TestClient, db, make_user, catalog
) -> None:
    _, product, plan, _ = catalog
    make_user("owner@example.com", UserRole.CUSTOMER, with_customer=True)
    make_user("other@example.com", UserRole.CUSTOMER, with_customer=True)
    other = _customer(db, "other@example.com")
    theirs = _sub(
        db,
        other,
        plan,
        product,
        status=SubscriptionStatus.ACTIVE,
        next_billing_date=TODAY,
    )
    _login(client, "owner@example.com")

    assert client.post(f"/subscriptions/{theirs.id}/close").status_code == 404


def test_customer_detail_hides_staff_transitions(
    client: TestClient, db, make_user
) -> None:
    make_user("cust@example.com", UserRole.CUSTOMER, with_customer=True)
    customer = _customer(db, "cust@example.com")
    product = make_product(db, name="Widget", price=Decimal("100.00"))
    plan = make_plan(db, name="Flexible", allow_early_close=True)
    subscription = _sub(
        db,
        customer,
        plan,
        product,
        status=SubscriptionStatus.ACTIVE,
        next_billing_date=TODAY,
    )
    _login(client, "cust@example.com")

    body = client.get(f"/subscriptions/{subscription.id}").json()

    assert body["allowed_transitions"] == []
    assert body["can_close"] is True
    assert body["plan_allow_early_close"] is True


def test_staff_can_clear_the_expiry_date(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    subscription = _sub(
        db,
        customer,
        plan,
        product,
        expiry_date=date(2026, 12, 31),
    )
    _as_staff(client, make_user)

    res = client.patch(
        f"/subscriptions/{subscription.id}", json={"expiry_date": None}
    )

    assert res.status_code == 200
    assert res.json()["expiry_date"] is None


def test_plan_minimum_quantity_is_enforced(
    client: TestClient, db, make_user, catalog
) -> None:
    customer, product, plan, _ = catalog
    plan.min_quantity = 3
    db.flush()
    _as_staff(client, make_user)

    too_few = client.post(
        "/subscriptions",
        json={
            "customer_id": customer.id,
            "plan_id": plan.id,
            "start_date": "2026-02-01",
            "lines": [{"product_id": product.id, "quantity": 2}],
        },
    )
    assert too_few.status_code == 400
    assert "lines" in too_few.json()["error"]["fields"]

    enough = client.post(
        "/subscriptions",
        json={
            "customer_id": customer.id,
            "plan_id": plan.id,
            "start_date": "2026-02-01",
            "lines": [{"product_id": product.id, "quantity": 3}],
        },
    )
    assert enough.status_code == 201
