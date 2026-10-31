"""Customers. Staff and admin manage all customers; a customer sees only their own."""

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import require_customer, require_staff_or_admin
from app.db import get_db
from app.errors import AppError
from app.models import Customer, Invoice, InvoiceStatus, User
from app.schemas.customers import (
    CustomerCreate,
    CustomerDetail,
    CustomerOut,
    CustomerPage,
    CustomerSelfUpdate,
    CustomerUpdate,
)

router = APIRouter(prefix="/customers", tags=["customers"])

DbSession = Annotated[Session, Depends(get_db)]
Staff = Depends(require_staff_or_admin)


def _email_taken() -> AppError:
    return AppError(
        "Please fix the highlighted fields.",
        code="validation_error",
        status_code=409,
        fields={"email": "A customer with this email already exists"},
    )


def _get_customer(db: Session, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise AppError("Customer not found.", code="not_found", status_code=404)
    return customer


def _detail(db: Session, customer: Customer) -> dict:
    owed = db.scalar(
        select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0)).where(
            Invoice.customer_id == customer.id, Invoice.status == InvoiceStatus.CONFIRMED
        )
    )
    out = CustomerOut.model_validate(customer).model_dump()
    return {**out, "outstanding_balance": Decimal(owed or 0)}


# --- Customer portal (own profile). Declared before "/{customer_id}". ---


@router.get("/me", response_model=CustomerDetail)
def get_me(db: DbSession, user: Annotated[User, Depends(require_customer)]):
    customer = db.scalar(select(Customer).where(Customer.user_id == user.id))
    if customer is None:
        raise AppError("Customer not found.", code="not_found", status_code=404)
    return _detail(db, customer)


@router.patch("/me", response_model=CustomerDetail)
def update_me(
    body: CustomerSelfUpdate, db: DbSession, user: Annotated[User, Depends(require_customer)]
):
    customer = db.scalar(select(Customer).where(Customer.user_id == user.id))
    if customer is None:
        raise AppError("Customer not found.", code="not_found", status_code=404)
    for key, value in body.model_dump(exclude_unset=True).items():
        if key == "name" and value is None:
            continue
        setattr(customer, key, value)
    db.commit()
    return _detail(db, customer)


# --- Back office ---


@router.get("", response_model=CustomerPage, dependencies=[Staff])
def list_customers(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    search: Annotated[str | None, Query(max_length=200)] = None,
):
    query = select(Customer)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.where(
            or_(
                Customer.name.ilike(like),
                Customer.email.ilike(like),
                Customer.company.ilike(like),
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(Customer.name, Customer.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post(
    "", response_model=CustomerDetail, status_code=status.HTTP_201_CREATED, dependencies=[Staff]
)
def create_customer(body: CustomerCreate, db: DbSession):
    if db.scalar(select(Customer.id).where(func.lower(Customer.email) == body.email)):
        raise _email_taken()
    # If the person already has a login, link the profile to it.
    user = db.scalar(select(User).where(User.email == body.email))
    user_id = None
    if user is not None and db.scalar(select(Customer.id).where(Customer.user_id == user.id)) is None:
        user_id = user.id
    customer = Customer(user_id=user_id, **body.model_dump())
    db.add(customer)
    db.commit()
    return _detail(db, customer)


@router.get("/{customer_id}", response_model=CustomerDetail, dependencies=[Staff])
def get_customer(customer_id: int, db: DbSession):
    return _detail(db, _get_customer(db, customer_id))


@router.patch("/{customer_id}", response_model=CustomerDetail, dependencies=[Staff])
def update_customer(customer_id: int, body: CustomerUpdate, db: DbSession):
    customer = _get_customer(db, customer_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("name", "x") is None or changes.get("email", "x") is None:
        raise AppError(
            "Please fix the highlighted fields.",
            code="validation_error",
            status_code=422,
            fields={k: "This field cannot be empty" for k in ("name", "email") if k in changes and changes[k] is None},
        )
    new_email = changes.get("email")
    if new_email and new_email != customer.email.lower():
        clash = db.scalar(
            select(Customer.id).where(
                func.lower(Customer.email) == new_email, Customer.id != customer.id
            )
        )
        if clash:
            raise _email_taken()
    for key, value in changes.items():
        setattr(customer, key, value)
    db.commit()
    return _detail(db, customer)
