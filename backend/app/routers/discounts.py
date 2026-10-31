"""Discount rule endpoints with usage statistics (Admin only)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.db import get_db
from app.errors import AppError
from app.models.catalog import Product
from app.models.discount import DiscountRule
from app.models.enums import DiscountScope, InvoiceLineType, InvoiceStatus
from app.models.invoice import Invoice, InvoiceLine
from app.schemas.catalog import (
    DiscountRuleCreate,
    DiscountRuleOut,
    DiscountRulePage,
    DiscountRuleUpdate,
)

router = APIRouter(prefix="/discounts", tags=["discounts"], dependencies=[Depends(require_admin)])
DbSession = Annotated[Session, Depends(get_db)]


def _rule_usage_counts(db: Session, rule_ids: list[int]) -> dict[int, int]:
    """Count how many times each rule was used on non-cancelled invoices."""
    if not rule_ids:
        return {}
    rows = db.execute(
        select(InvoiceLine.discount_rule_id, func.count(InvoiceLine.id))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(
            InvoiceLine.discount_rule_id.in_(rule_ids),
            InvoiceLine.line_type == InvoiceLineType.DISCOUNT,
            Invoice.status != InvoiceStatus.CANCELLED,
        )
        .group_by(InvoiceLine.discount_rule_id)
    ).all()
    return {row[0]: row[1] for row in rows}


def _enrich_rule(rule: DiscountRule, used: int) -> DiscountRuleOut:
    today = date.today()
    status_label = "active"
    if not rule.is_active:
        status_label = "inactive"
    elif rule.end_date and rule.end_date < today:
        status_label = "expired"
    elif rule.usage_limit is not None and used >= rule.usage_limit:
        status_label = "exhausted"

    return DiscountRuleOut(
        id=rule.id,
        name=rule.name,
        type=rule.type,
        value=rule.value,
        min_purchase=rule.min_purchase,
        min_quantity=rule.min_quantity,
        start_date=rule.start_date,
        end_date=rule.end_date,
        usage_limit=rule.usage_limit,
        scope=rule.scope,
        product_id=rule.product_id,
        is_active=rule.is_active,
        used_count=used,
        status=status_label,
        product_name=rule.product.name if rule.product else None,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _get_rule(db: Session, rule_id: int) -> DiscountRule:
    rule = db.scalar(
        select(DiscountRule)
        .options(joinedload(DiscountRule.product))
        .where(DiscountRule.id == rule_id)
    )
    if rule is None:
        raise AppError("Discount rule not found.", code="not_found", status_code=404)
    return rule


@router.get("", response_model=DiscountRulePage)
def list_discounts(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    search: Annotated[str | None, Query(max_length=200)] = None,
    is_active: bool | None = None,
):
    query = select(DiscountRule).options(joinedload(DiscountRule.product))
    if is_active is not None:
        query = query.where(DiscountRule.is_active == is_active)
    if search:
        query = query.where(DiscountRule.name.ilike(f"%{search.strip()}%"))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(DiscountRule.name.asc(), DiscountRule.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    rule_ids = [r.id for r in items]
    counts = _rule_usage_counts(db, rule_ids)
    enriched = [_enrich_rule(r, counts.get(r.id, 0)) for r in items]

    return {"items": enriched, "total": total, "page": page, "page_size": page_size}


@router.get("/{rule_id}", response_model=DiscountRuleOut)
def get_discount(rule_id: int, db: DbSession):
    rule = _get_rule(db, rule_id)
    counts = _rule_usage_counts(db, [rule.id])
    return _enrich_rule(rule, counts.get(rule.id, 0))


@router.post("", response_model=DiscountRuleOut, status_code=status.HTTP_201_CREATED)
def create_discount(body: DiscountRuleCreate, db: DbSession):
    if body.scope == DiscountScope.PRODUCT:
        if not body.product_id or db.get(Product, body.product_id) is None:
            raise AppError("Selected product does not exist.", code="validation_error", status_code=400, fields={"product_id": "Product not found"})

    rule = DiscountRule(
        name=body.name,
        type=body.type,
        value=body.value,
        min_purchase=body.min_purchase,
        min_quantity=body.min_quantity,
        start_date=body.start_date,
        end_date=body.end_date,
        usage_limit=body.usage_limit,
        scope=body.scope,
        product_id=body.product_id if body.scope == DiscountScope.PRODUCT else None,
        is_active=body.is_active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    rule = _get_rule(db, rule.id)
    return _enrich_rule(rule, 0)


@router.put("/{rule_id}", response_model=DiscountRuleOut)
def update_discount(rule_id: int, body: DiscountRuleUpdate, db: DbSession):
    rule = _get_rule(db, rule_id)
    if body.product_id is not None or body.scope == DiscountScope.PRODUCT:
        target_pid = body.product_id if body.product_id is not None else rule.product_id
        if not target_pid or db.get(Product, target_pid) is None:
            raise AppError("Selected product does not exist.", code="validation_error", status_code=400, fields={"product_id": "Product not found"})

    if body.name is not None:
        rule.name = body.name
    if body.type is not None:
        rule.type = body.type
    if body.value is not None:
        rule.value = body.value
    if body.min_purchase is not None:
        rule.min_purchase = body.min_purchase
    if body.min_quantity is not None:
        rule.min_quantity = body.min_quantity
    if body.start_date is not None:
        rule.start_date = body.start_date
    if body.end_date is not None:
        rule.end_date = body.end_date
    if body.usage_limit is not None:
        rule.usage_limit = body.usage_limit
    if body.scope is not None:
        rule.scope = body.scope
        if body.scope == DiscountScope.SUBSCRIPTION:
            rule.product_id = None
    if body.product_id is not None and rule.scope == DiscountScope.PRODUCT:
        rule.product_id = body.product_id
    if body.is_active is not None:
        rule.is_active = body.is_active

    db.commit()
    db.refresh(rule)
    rule = _get_rule(db, rule.id)
    counts = _rule_usage_counts(db, [rule.id])
    return _enrich_rule(rule, counts.get(rule.id, 0))
