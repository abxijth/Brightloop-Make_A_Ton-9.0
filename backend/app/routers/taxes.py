"""Tax configuration endpoints (Admin only)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.db import get_db
from app.errors import AppError
from app.models.tax import Tax
from app.schemas.catalog import TaxCreate, TaxOut, TaxPage, TaxUpdate

router = APIRouter(prefix="/taxes", tags=["taxes"], dependencies=[Depends(require_admin)])
DbSession = Annotated[Session, Depends(get_db)]


def _get_tax(db: Session, tax_id: int) -> Tax:
    tax = db.get(Tax, tax_id)
    if tax is None:
        raise AppError("Tax not found.", code="not_found", status_code=404)
    return tax


@router.get("", response_model=TaxPage)
def list_taxes(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    search: Annotated[str | None, Query(max_length=200)] = None,
    is_active: bool | None = None,
):
    query = select(Tax)
    if is_active is not None:
        query = query.where(Tax.is_active == is_active)
    if search:
        query = query.where(Tax.name.ilike(f"%{search.strip()}%"))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(Tax.name.asc(), Tax.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{tax_id}", response_model=TaxOut)
def get_tax(tax_id: int, db: DbSession):
    return _get_tax(db, tax_id)


@router.post("", response_model=TaxOut, status_code=status.HTTP_201_CREATED)
def create_tax(body: TaxCreate, db: DbSession):
    tax = Tax(
        name=body.name,
        type=body.type,
        value=body.value,
        is_active=body.is_active,
    )
    db.add(tax)
    db.commit()
    db.refresh(tax)
    return tax


@router.put("/{tax_id}", response_model=TaxOut)
def update_tax(tax_id: int, body: TaxUpdate, db: DbSession):
    tax = _get_tax(db, tax_id)
    if body.name is not None:
        tax.name = body.name
    if body.type is not None:
        tax.type = body.type
    if body.value is not None:
        tax.value = body.value
    if body.is_active is not None:
        tax.is_active = body.is_active

    db.commit()
    db.refresh(tax)
    return tax
