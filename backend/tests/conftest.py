"""Test fixtures: a throwaway Postgres database and an API client wired to it.

Tests run against `<database>_test` on the same server as `DATABASE_URL`, so the
dev database is never touched. The database is created on first use and every
table is emptied before each test.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.config import settings
from app.db import Base, get_db
from app.main import app
from app.models import Customer, User, UserRole
from app.security import hash_password

_dev_url = make_url(settings.database_url)
TEST_DB_NAME = f"{_dev_url.database}_test"
TEST_URL = _dev_url.set(database=TEST_DB_NAME)

PASSWORD = "Str0ng!pass"


@pytest.fixture(scope="session")
def engine():
    assert TEST_URL.database != _dev_url.database
    admin = create_engine(_dev_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB_NAME}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    admin.dispose()

    engine = create_engine(TEST_URL, pool_pre_ping=True)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables(engine) -> Iterator[None]:
    yield
    names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))


@pytest.fixture
def db(engine) -> Iterator[Session]:
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    def _get_db() -> Iterator[Session]:
        yield db

    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db: Session):
    """Insert a user directly (staff and admin have no signup route)."""

    def _make(
        email: str,
        role: UserRole = UserRole.CUSTOMER,
        *,
        password: str = PASSWORD,
        is_active: bool = True,
        with_customer: bool = False,
    ) -> User:
        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=email.split("@")[0],
            role=role,
            is_active=is_active,
        )
        db.add(user)
        db.flush()
        if with_customer:
            db.add(Customer(user_id=user.id, name=user.full_name, email=email))
        db.commit()
        return user

    return _make


def signup_body(email: str = "new@example.com", password: str = PASSWORD, **extra) -> dict:
    return {"email": email, "password": password, "confirm_password": password, **extra}
