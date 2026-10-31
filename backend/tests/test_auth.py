from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.auth import require_admin, require_customer, require_staff_or_admin
from app.db import get_db
from app.errors import register_error_handlers
from app.models import Customer, EmailType, Outbox, PasswordResetToken, User, UserRole
from app.security import COOKIE_NAME, create_access_token, password_problems, verify_password
from tests.conftest import PASSWORD, signup_body


def _login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def _request_reset(client: TestClient, db, email: str) -> str:
    client.post("/auth/forgot-password", json={"email": email})
    return db.scalars(select(PasswordResetToken.token)).one()


# ---- password rules ---------------------------------------------------------


@pytest.mark.parametrize(
    ("password", "missing"),
    [
        ("Sh0rt!a", "At least 8 characters"),
        ("alllower1!", "One uppercase letter"),
        ("ALLUPPER1!", "One lowercase letter"),
        ("NoNumber!!", "One number"),
        ("NoSpecial12", "One special character"),
    ],
)
def test_password_problems_names_each_missing_rule(password: str, missing: str) -> None:
    assert password_problems(password) == [missing]


def test_password_problems_empty_for_valid_password() -> None:
    assert password_problems(PASSWORD) == []


def test_signup_rejects_weak_password_on_password_field(client: TestClient) -> None:
    r = client.post("/auth/signup", json=signup_body(password="weak"))
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "validation_error"
    assert "password" in error["fields"]


def test_signup_rejects_mismatched_confirmation(client: TestClient) -> None:
    body = signup_body() | {"confirm_password": "Different1!"}
    r = client.post("/auth/signup", json=body)
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"confirm_password": "Passwords do not match"}


def test_signup_rejects_invalid_email(client: TestClient) -> None:
    r = client.post("/auth/signup", json=signup_body(email="not-an-email"))
    assert r.status_code == 422
    assert "email" in r.json()["error"]["fields"]


# ---- signup -----------------------------------------------------------------


def test_signup_creates_customer_user_and_logs_in(client: TestClient, db) -> None:
    r = client.post("/auth/signup", json=signup_body(" New@Example.com ", full_name="Nora"))
    assert r.status_code == 201
    assert r.json() == {
        "id": 1,
        "email": "new@example.com",
        "full_name": "Nora",
        "role": "customer",
    }
    assert COOKIE_NAME in client.cookies
    assert "password" not in r.text

    user = db.scalars(select(User)).one()
    assert user.password_hash != PASSWORD
    assert verify_password(PASSWORD, user.password_hash)
    customer = db.scalars(select(Customer)).one()
    assert (customer.user_id, customer.email, customer.name) == (user.id, "new@example.com", "Nora")
    assert client.get("/auth/me").json()["email"] == "new@example.com"


def test_signup_cannot_choose_a_role(client: TestClient, db) -> None:
    client.post("/auth/signup", json=signup_body() | {"role": "admin"})
    assert db.scalars(select(User)).one().role == UserRole.CUSTOMER


def test_signup_cookie_is_httponly(client: TestClient) -> None:
    r = client.post("/auth/signup", json=signup_body())
    assert "httponly" in r.headers["set-cookie"].lower()


def test_signup_links_customer_profile_created_by_staff(client: TestClient, db) -> None:
    db.add(Customer(name="Acme", company="Acme Ltd", email="buyer@acme.com"))
    db.commit()

    client.post("/auth/signup", json=signup_body("Buyer@Acme.com"))

    customer = db.scalars(select(Customer)).one()
    user = db.scalars(select(User)).one()
    assert customer.user_id == user.id
    assert customer.company == "Acme Ltd"


def test_signup_duplicate_email_is_rejected_on_email_field(client: TestClient, db) -> None:
    client.post("/auth/signup", json=signup_body("dup@example.com"))
    r = client.post("/auth/signup", json=signup_body("DUP@example.com"))
    assert r.status_code == 409
    assert r.json()["error"]["fields"] == {"email": "Email is already registered"}
    assert len(db.scalars(select(User)).all()) == 1


# ---- login / logout / me ----------------------------------------------------


def test_login_succeeds_and_sets_cookie(client: TestClient, make_user) -> None:
    make_user("a@example.com")
    r = _login(client, "A@Example.com")
    assert r.status_code == 200
    assert r.json()["email"] == "a@example.com"
    assert client.get("/auth/me").status_code == 200


@pytest.mark.parametrize(
    ("email", "password"),
    [("a@example.com", "Wrong1!pass"), ("nobody@example.com", PASSWORD)],
)
def test_login_failure_gives_one_generic_answer(
    client: TestClient, make_user, email: str, password: str
) -> None:
    make_user("a@example.com")
    r = _login(client, email, password)
    assert r.status_code == 401
    assert r.json()["error"]["message"] == "Invalid email or password"
    assert COOKIE_NAME not in client.cookies


def test_deactivated_user_cannot_log_in(client: TestClient, make_user) -> None:
    make_user("off@example.com", UserRole.STAFF, is_active=False)
    r = _login(client, "off@example.com")
    assert r.status_code == 401
    assert r.json()["error"]["message"] == "Invalid email or password"


def test_deactivating_user_invalidates_existing_session(client: TestClient, make_user, db) -> None:
    user = make_user("a@example.com", UserRole.STAFF)
    _login(client, "a@example.com")
    user.is_active = False
    db.commit()
    assert client.get("/auth/me").status_code == 401


def test_logout_clears_session(client: TestClient, make_user) -> None:
    make_user("a@example.com")
    _login(client, "a@example.com")
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/me").status_code == 401


def test_me_requires_authentication(client: TestClient) -> None:
    r = client.get("/auth/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthenticated"


def test_me_rejects_garbage_and_expired_tokens(client: TestClient, make_user, monkeypatch) -> None:
    user = make_user("a@example.com")
    client.cookies.set(COOKIE_NAME, "not-a-jwt")
    assert client.get("/auth/me").status_code == 401

    monkeypatch.setattr("app.security.settings.jwt_expire_minutes", -5)
    client.cookies.set(COOKIE_NAME, create_access_token(user.id, "customer"))
    assert client.get("/auth/me").status_code == 401


# ---- role checks ------------------------------------------------------------


@pytest.fixture
def role_client(db) -> TestClient:
    """The real error handlers and role dependencies on throwaway probe routes."""
    probe = FastAPI()
    register_error_handlers(probe)
    probe.dependency_overrides[get_db] = lambda: db

    for name, dep in [
        ("admin", require_admin),
        ("staff", require_staff_or_admin),
        ("customer", require_customer),
    ]:
        probe.get(f"/{name}-only")(lambda user=Depends(dep): {"role": user.role.value})
    return TestClient(probe)


ALLOWED = {
    "/admin-only": {UserRole.ADMIN},
    "/staff-only": {UserRole.ADMIN, UserRole.STAFF},
    "/customer-only": {UserRole.CUSTOMER},
}


@pytest.mark.parametrize("path", ALLOWED)
@pytest.mark.parametrize("role", list(UserRole))
def test_role_dependencies(role_client: TestClient, make_user, path: str, role: UserRole) -> None:
    make_user("u@example.com", role)
    role_client.cookies.set(COOKIE_NAME, create_access_token(1, role.value))

    r = role_client.get(path)
    if role in ALLOWED[path]:
        assert (r.status_code, r.json()) == (200, {"role": role.value})
    else:
        assert r.status_code == 403
        assert r.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize("path", ALLOWED)
def test_role_dependencies_require_login(role_client: TestClient, path: str) -> None:
    assert role_client.get(path).status_code == 401


def test_role_comes_from_database_not_token(role_client: TestClient, make_user) -> None:
    """A customer can't promote themselves by forging the role claim in a valid token."""
    customer = make_user("c@example.com", UserRole.CUSTOMER)
    role_client.cookies.set(COOKIE_NAME, create_access_token(customer.id, "admin"))
    assert role_client.get("/admin-only").status_code == 403


# ---- customer isolation -----------------------------------------------------
# Customer-facing list endpoints don't exist yet. Until they do, this checks the
# identity those endpoints will filter on: each session resolves to its own
# user and its own Customer row, never another customer's.


def test_each_customer_session_resolves_to_its_own_identity(client: TestClient, db) -> None:
    client.post("/auth/signup", json=signup_body("one@example.com"))
    other = TestClient(client.app)
    other.post("/auth/signup", json=signup_body("two@example.com"))

    assert client.get("/auth/me").json()["email"] == "one@example.com"
    assert other.get("/auth/me").json()["email"] == "two@example.com"

    owners = {c.email: c.user_id for c in db.scalars(select(Customer))}
    assert owners["one@example.com"] != owners["two@example.com"]


# ---- forgot / reset password ------------------------------------------------


def test_forgot_password_answer_is_identical_for_unknown_email(client: TestClient, make_user) -> None:
    make_user("a@example.com")
    known = client.post("/auth/forgot-password", json={"email": "a@example.com"})
    unknown = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert (known.status_code, known.json()) == (unknown.status_code, unknown.json())


def test_forgot_password_writes_link_to_outbox(client: TestClient, make_user, db) -> None:
    make_user("a@example.com")
    token = _request_reset(client, db, "a@example.com")

    mail = db.scalars(select(Outbox)).one()
    assert mail.type == EmailType.PASSWORD_RESET
    assert mail.to_email == "a@example.com"
    assert f"/reset-password?token={token}" in mail.body_html


def test_forgot_password_for_unknown_or_inactive_email_writes_nothing(
    client: TestClient, make_user, db
) -> None:
    make_user("off@example.com", is_active=False)
    client.post("/auth/forgot-password", json={"email": "off@example.com"})
    client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert db.scalars(select(Outbox)).all() == []
    assert db.scalars(select(PasswordResetToken)).all() == []


def test_reset_password_changes_password(client: TestClient, make_user, db) -> None:
    make_user("a@example.com")
    token = _request_reset(client, db, "a@example.com")
    new = "N3w!password"

    r = client.post(
        "/auth/reset-password", json={"token": token, "password": new, "confirm_password": new}
    )
    assert r.status_code == 200
    assert _login(client, "a@example.com", PASSWORD).status_code == 401
    assert _login(client, "a@example.com", new).status_code == 200


def test_reset_token_is_single_use(client: TestClient, make_user, db) -> None:
    make_user("a@example.com")
    token = _request_reset(client, db, "a@example.com")
    body = {"token": token, "password": "N3w!password", "confirm_password": "N3w!password"}

    assert client.post("/auth/reset-password", json=body).status_code == 200
    again = client.post("/auth/reset-password", json=body | {"password": "0th3r!Password", "confirm_password": "0th3r!Password"})
    assert again.status_code == 400
    assert again.json()["error"]["fields"] == {"token": "Reset link is invalid or expired"}
    assert _login(client, "a@example.com", "N3w!password").status_code == 200


def test_reset_token_expires(client: TestClient, make_user, db) -> None:
    make_user("a@example.com")
    token = _request_reset(client, db, "a@example.com")
    record = db.scalars(select(PasswordResetToken)).one()
    record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    r = client.post(
        "/auth/reset-password",
        json={"token": token, "password": "N3w!password", "confirm_password": "N3w!password"},
    )
    assert r.status_code == 400
    assert _login(client, "a@example.com", PASSWORD).status_code == 200


def test_reset_rejects_unknown_token(client: TestClient) -> None:
    r = client.post(
        "/auth/reset-password",
        json={"token": "nope", "password": "N3w!password", "confirm_password": "N3w!password"},
    )
    assert r.status_code == 400


def test_reset_enforces_password_rules(client: TestClient, make_user, db) -> None:
    make_user("a@example.com")
    token = _request_reset(client, db, "a@example.com")

    r = client.post(
        "/auth/reset-password",
        json={"token": token, "password": "weak", "confirm_password": "weak"},
    )
    assert r.status_code == 422
    assert "password" in r.json()["error"]["fields"]
    assert db.scalars(select(PasswordResetToken)).one().used_at is None
