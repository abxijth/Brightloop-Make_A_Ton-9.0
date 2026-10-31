"""Outbox: log-only emails (nothing is sent over SMTP). Admin and staff only."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select

from app.auth import require_staff_or_admin
from app.db import get_db
from app.errors import AppError
from app.models import EmailType, Outbox
from app.schemas.outbox import OutboxDetail, OutboxPage

from sqlalchemy.orm import Session

router = APIRouter(
    prefix="/outbox",
    tags=["outbox"],
    dependencies=[Depends(require_staff_or_admin)],
)

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=OutboxPage)
def list_outbox(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    type: EmailType | None = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
):
    query = select(Outbox)
    if type is not None:
        query = query.where(Outbox.type == type)
    if search:
        like = f"%{search.strip()}%"
        query = query.where(or_(Outbox.to_email.ilike(like), Outbox.subject.ilike(like)))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    created = Outbox.created_at.asc() if order == "asc" else Outbox.created_at.desc()
    id_order = Outbox.id.asc() if order == "asc" else Outbox.id.desc()
    items = db.scalars(
        query.order_by(created, id_order).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{outbox_id}", response_model=OutboxDetail)
def get_outbox(outbox_id: int, db: DbSession):
    row = db.get(Outbox, outbox_id)
    if row is None:
        raise AppError("Email not found.", code="not_found", status_code=404)
    return row
