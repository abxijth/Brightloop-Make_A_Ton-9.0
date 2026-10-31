"""Discount rule endpoints with usage statistics (Admin only)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.db import get_db
from app.errors import AppError
from app.models.catalog import Product
from app.models.discount import DiscountRule
from app.models.enums import DiscountScope, InvoiceLineType, InvoiceStatus
from app.models.invoice import Invoice, InvoiceLine
from app.schemas.catalog import (
    DiscountRuleBase,
    DiscountRuleCreate,
    DiscountRuleOut,
    DiscountRulePage,
    DiscountRuleUpdate,
    apply_update,
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
    sent = body.model_fields_set
    new_scope = body.scope if "scope" in sent and body.scope is not None else rule.scope
    if new_scope == DiscountScope.SUBSCRIPTION:
        if body.product_id is not None:
            raise AppError(
                "A product can only be set on a product-scoped discount.",
                code="validation_error",
                status_code=422,
                fields={"product_id": "Only valid when scope is 'product'"},
            )
        if "scope" in sent:
            body.product_id = None  # switching to subscription scope detaches the product
            body.model_fields_set.add("product_id")
    apply_update(rule, body, DiscountRuleBase, skip=("product_name",))
    if rule.scope == DiscountScope.PRODUCT and db.get(Product, rule.product_id) is None:
        db.rollback()
        raise AppError("Selected product does not exist.", code="validation_error", status_code=400, fields={"product_id": "Product not found"})

    db.commit()
    db.refresh(rule)
    rule = _get_rule(db, rule.id)
    counts = _rule_usage_counts(db, [rule.id])
    return _enrich_rule(rule, counts.get(rule.id, 0))
