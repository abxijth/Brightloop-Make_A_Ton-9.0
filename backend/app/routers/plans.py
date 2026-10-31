"""Plan catalog endpoints (Admin only)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.db import get_db
from app.errors import AppError
from app.models.catalog import Plan
from app.schemas.catalog import PlanCreate, PlanOut, PlanPage, PlanUpdate

router = APIRouter(prefix="/plans", tags=["plans"], dependencies=[Depends(require_admin)])
DbSession = Annotated[Session, Depends(get_db)]


def _get_plan(db: Session, plan_id: int) -> Plan:
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise AppError("Plan not found.", code="not_found", status_code=404)
    return plan


@router.get("", response_model=PlanPage)
def list_plans(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    search: Annotated[str | None, Query(max_length=200)] = None,
    is_active: bool | None = None,
):
    query = select(Plan)
    if is_active is not None:
        query = query.where(Plan.is_active == is_active)
    if search:
        query = query.where(Plan.name.ilike(f"%{search.strip()}%"))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(Plan.name.asc(), Plan.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{plan_id}", response_model=PlanOut)
def get_plan(plan_id: int, db: DbSession):
    return _get_plan(db, plan_id)


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(body: PlanCreate, db: DbSession):
    plan = Plan(
        name=body.name,
        price=body.price,
        billing_period=body.billing_period,
        min_quantity=body.min_quantity,
        available_from=body.available_from,
        available_to=body.available_to,
        auto_close=body.auto_close,
        allow_early_close=body.allow_early_close,
        is_active=body.is_active,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.put("/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, body: PlanUpdate, db: DbSession):
    plan = _get_plan(db, plan_id)
    if body.name is not None:
        plan.name = body.name
    if body.price is not None:
        plan.price = body.price
    if body.billing_period is not None:
        plan.billing_period = body.billing_period
    if body.min_quantity is not None:
        plan.min_quantity = body.min_quantity
    if body.available_from is not None:
        plan.available_from = body.available_from
    if body.available_to is not None:
        plan.available_to = body.available_to
    if body.auto_close is not None:
        plan.auto_close = body.auto_close
    if body.allow_early_close is not None:
        plan.allow_early_close = body.allow_early_close
    if body.is_active is not None:
        plan.is_active = body.is_active

    db.commit()
    db.refresh(plan)
    return plan
