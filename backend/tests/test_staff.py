import pytest
from fastapi.testclient import TestClient

from app.models import UserRole
from tests.conftest import PASSWORD


def _login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def _body(email="new.staff@example.com", **extra):
    return {"email": email, "full_name": "New Staff", "password": PASSWORD, **extra}


@pytest.fixture
def admin(client: TestClient, make_user):
    user = make_user("admin@example.com", UserRole.ADMIN)
    _login(client, user.email)
    return user


@pytest.mark.parametrize("role", [None, UserRole.STAFF, UserRole.CUSTOMER])
def test_admin_only(client: TestClient, make_user, role) -> None:
    if role:
        make_user("u@example.com", role, with_customer=role == UserRole.CUSTOMER)
        _login(client, "u@example.com")
    expected = 403 if role else 401
    assert client.get("/staff").status_code == expected
    assert client.post("/staff", json=_body()).status_code == expected
    assert client.post("/staff/1/deactivate").status_code == expected


def test_list_excludes_customers(client: TestClient, make_user, admin) -> None:
    make_user("staff@example.com", UserRole.STAFF)
    make_user("cust@example.com", UserRole.CUSTOMER, with_customer=True)
    body = client.get("/staff").json()
    assert {i["email"] for i in body["items"]} == {"admin@example.com", "staff@example.com"}
    assert "password_hash" not in body["items"][0]


def test_create_staff_can_log_in(client: TestClient, admin) -> None:
    res = client.post("/staff", json=_body())
    assert res.status_code == 201
    assert res.json()["role"] == "staff" and res.json()["is_active"] is True
    other = TestClient(client.app)
    assert _login(other, "new.staff@example.com").status_code == 200


def test_create_duplicate_email(client: TestClient, admin) -> None:
    res = client.post("/staff", json=_body("ADMIN@example.com"))
    assert res.status_code == 409
    assert res.json()["error"]["fields"]["email"] == "Email is already registered"


def test_create_weak_password_and_bad_role(client: TestClient, admin) -> None:
    weak = client.post("/staff", json=_body(password="weak"))
    assert weak.status_code == 422 and "password" in weak.json()["error"]["fields"]
    role = client.post("/staff", json=_body(role="customer"))
    assert role.status_code == 422 and "role" in role.json()["error"]["fields"]


def test_deactivate_blocks_login_and_can_reactivate(client: TestClient, make_user, admin) -> None:
    staff = make_user("staff@example.com", UserRole.STAFF)
    res = client.post(f"/staff/{staff.id}/deactivate")
    assert res.status_code == 200 and res.json()["is_active"] is False
    assert _login(TestClient(client.app), "staff@example.com").status_code in (400, 401, 403)
    assert client.post(f"/staff/{staff.id}/activate").json()["is_active"] is True
    assert _login(TestClient(client.app), "staff@example.com").status_code == 200


def test_cannot_deactivate_self_or_customers(client: TestClient, make_user, admin) -> None:
    assert client.post(f"/staff/{admin.id}/deactivate").status_code == 400
    cust = make_user("cust@example.com", UserRole.CUSTOMER, with_customer=True)
    assert client.post(f"/staff/{cust.id}/deactivate").status_code == 404
    assert client.post("/staff/9999/deactivate").status_code == 404
