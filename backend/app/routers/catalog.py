"""Catalog and configuration: taxes, products (with variants), plans, discount rules.

Staff and admin can read (the subscription form needs these lists); only admin writes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import require_admin, require_staff_or_admin
from app.db import get_db
from app.errors import AppError
from app.models import (
    DiscountRule,
    Invoice,
    InvoiceLine,
    InvoiceLineType,
    InvoiceStatus,
    Plan,
    Product,
    ProductVariant,
    Tax,
)
from app.schemas.catalog import (
    DiscountIn,
    DiscountOut,
    PlanIn,
    PlanOut,
    ProductIn,
    ProductOut,
    TaxIn,
    TaxOut,
)

DbSession = Annotated[Session, Depends(get_db)]
Read = Depends(require_staff_or_admin)
Write = Depends(require_admin)


def _get(db: Session, model, obj_id: int, label: str):
    obj = db.get(model, obj_id)
    if obj is None:
        raise AppError(f"{label} not found.", code="not_found", status_code=404)
    return obj


def _field_error(field: str, message: str, status_code: int = 422) -> AppError:
    return AppError(
        "Please fix the highlighted fields.",
        code="validation_error",
        status_code=status_code,
        fields={field: message},
    )


def _delete(db: Session, obj, label: str) -> Response:
    db.delete(obj)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(
            f"This {label} is already used. Deactivate it instead of deleting it.",
            code="in_use",
            status_code=409,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _check_tax(db: Session, tax_id: int | None) -> None:
    if tax_id is not None and db.get(Tax, tax_id) is None:
        raise _field_error("tax_id", "Tax does not exist")


# --- Taxes ---

taxes = APIRouter(prefix="/taxes", tags=["taxes"])


@taxes.get("", response_model=list[TaxOut], dependencies=[Read])
def list_taxes(db: DbSession):
    return db.scalars(select(Tax).order_by(Tax.name, Tax.id)).all()


@taxes.post("", response_model=TaxOut, status_code=201, dependencies=[Write])
def create_tax(body: TaxIn, db: DbSession):
    tax = Tax(**body.model_dump())
    db.add(tax)
    db.commit()
    return tax


@taxes.patch("/{tax_id}", response_model=TaxOut, dependencies=[Write])
def update_tax(tax_id: int, body: TaxIn, db: DbSession):
    tax = _get(db, Tax, tax_id, "Tax")
    for k, v in body.model_dump().items():
        setattr(tax, k, v)
    db.commit()
    return tax


@taxes.delete("/{tax_id}", status_code=204, dependencies=[Write])
def delete_tax(tax_id: int, db: DbSession):
    return _delete(db, _get(db, Tax, tax_id, "Tax"), "tax")


# --- Products ---

products = APIRouter(prefix="/products", tags=["products"])


def _load_product(db: Session, product_id: int) -> Product:
    product = db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.variants), selectinload(Product.tax))
    )
    if product is None:
        raise AppError("Product not found.", code="not_found", status_code=404)
    return product


def _check_variants(body: ProductIn) -> None:
    seen = set()
    for v in body.variants:
        key = (v.attribute.strip().lower(), v.value.strip().lower())
        if key in seen:
            raise _field_error("variants", f"Duplicate variant {v.attribute}: {v.value}")
        seen.add(key)


@products.get("", response_model=list[ProductOut], dependencies=[Read])
def list_products(db: DbSession):
    return db.scalars(
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.tax))
        .order_by(Product.name, Product.id)
    ).all()


@products.post("", response_model=ProductOut, status_code=201, dependencies=[Write])
def create_product(body: ProductIn, db: DbSession):
    _check_tax(db, body.tax_id)
    _check_variants(body)
    data = body.model_dump(exclude={"variants"})
    product = Product(**data, variants=[ProductVariant(**v.model_dump()) for v in body.variants])
    db.add(product)
    db.commit()
    return _load_product(db, product.id)


@products.patch("/{product_id}", response_model=ProductOut, dependencies=[Write])
def update_product(product_id: int, body: ProductIn, db: DbSession):
    product = _load_product(db, product_id)
    _check_tax(db, body.tax_id)
    _check_variants(body)
    for k, v in body.model_dump(exclude={"variants"}).items():
        setattr(product, k, v)
    # Replace variants by (attribute, value) so existing rows keep their ids
    # (subscription lines may reference them).
    existing = {(v.attribute, v.value): v for v in product.variants}
    wanted = {(v.attribute, v.value): v for v in body.variants}
    for key, variant in existing.items():
        if key not in wanted:
            product.variants.remove(variant)
    for key, v in wanted.items():
        if key in existing:
            existing[key].extra_price = v.extra_price
        else:
            product.variants.append(ProductVariant(**v.model_dump()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(
            "A removed variant is already used on a subscription.",
            code="in_use",
            status_code=409,
        )
    return _load_product(db, product_id)


@products.delete("/{product_id}", status_code=204, dependencies=[Write])
def delete_product(product_id: int, db: DbSession):
    return _delete(db, _load_product(db, product_id), "product")


# --- Plans ---

plans = APIRouter(prefix="/plans", tags=["plans"])


@plans.get("", response_model=list[PlanOut], dependencies=[Read])
def list_plans(db: DbSession):
    return db.scalars(select(Plan).order_by(Plan.name, Plan.id)).all()


@plans.post("", response_model=PlanOut, status_code=201, dependencies=[Write])
def create_plan(body: PlanIn, db: DbSession):
    plan = Plan(**body.model_dump())
    db.add(plan)
    db.commit()
    return plan


@plans.patch("/{plan_id}", response_model=PlanOut, dependencies=[Write])
def update_plan(plan_id: int, body: PlanIn, db: DbSession):
    plan = _get(db, Plan, plan_id, "Plan")
    for k, v in body.model_dump().items():
        setattr(plan, k, v)
    db.commit()
    return plan


@plans.delete("/{plan_id}", status_code=204, dependencies=[Write])
def delete_plan(plan_id: int, db: DbSession):
    return _delete(db, _get(db, Plan, plan_id, "Plan"), "plan")


# --- Discount rules ---

discounts = APIRouter(prefix="/discounts", tags=["discounts"])


def _usage_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(InvoiceLine.discount_rule_id, func.count(InvoiceLine.id))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(
            InvoiceLine.line_type == InvoiceLineType.DISCOUNT,
            InvoiceLine.discount_rule_id.is_not(None),
            Invoice.status != InvoiceStatus.CANCELLED,
        )
        .group_by(InvoiceLine.discount_rule_id)
    ).all()
    return {rule_id: n for rule_id, n in rows}


def _discount_out(rule: DiscountRule, used: dict[int, int]) -> DiscountOut:
    out = DiscountOut.model_validate(rule)
    out.times_used = used.get(rule.id, 0)
    out.product_name = rule.product.name if rule.product else None
    return out


def _check_product(db: Session, product_id: int | None) -> None:
    if product_id is not None and db.get(Product, product_id) is None:
        raise _field_error("product_id", "Product does not exist")


@discounts.get("", response_model=list[DiscountOut], dependencies=[Read])
def list_discounts(db: DbSession):
    rules = db.scalars(
        select(DiscountRule)
        .options(selectinload(DiscountRule.product))
        .order_by(DiscountRule.start_date.desc(), DiscountRule.id.desc())
    ).all()
    used = _usage_counts(db)
    return [_discount_out(r, used) for r in rules]


@discounts.post("", response_model=DiscountOut, status_code=201, dependencies=[Write])
def create_discount(body: DiscountIn, db: DbSession):
    _check_product(db, body.product_id)
    rule = DiscountRule(**body.model_dump())
    db.add(rule)
    db.commit()
    return _discount_out(rule, _usage_counts(db))


@discounts.patch("/{discount_id}", response_model=DiscountOut, dependencies=[Write])
def update_discount(discount_id: int, body: DiscountIn, db: DbSession):
    rule = _get(db, DiscountRule, discount_id, "Discount")
    _check_product(db, body.product_id)
    for k, v in body.model_dump().items():
        setattr(rule, k, v)
    db.commit()
    return _discount_out(rule, _usage_counts(db))


@discounts.delete("/{discount_id}", status_code=204, dependencies=[Write])
def delete_discount(discount_id: int, db: DbSession):
    return _delete(db, _get(db, DiscountRule, discount_id, "Discount"), "discount")
