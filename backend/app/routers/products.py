"""Product and Product Variant catalog endpoints (Admin only)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import require_admin
from app.db import get_db
from app.errors import AppError
from app.models.catalog import Product, ProductVariant
from app.models.tax import Tax
from app.schemas.catalog import ProductBase, ProductCreate, ProductOut, ProductPage, ProductUpdate, apply_update

router = APIRouter(prefix="/products", tags=["products"], dependencies=[Depends(require_admin)])
DbSession = Annotated[Session, Depends(get_db)]


def _get_product(db: Session, product_id: int) -> Product:
    product = db.scalar(
        select(Product)
        .options(joinedload(Product.tax), selectinload(Product.variants))
        .where(Product.id == product_id)
    )
    if product is None:
        raise AppError("Product not found.", code="not_found", status_code=404)
    return product


@router.get("", response_model=ProductPage)
def list_products(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    search: Annotated[str | None, Query(max_length=200)] = None,
    is_active: bool | None = None,
):
    query = (
        select(Product)
        .options(joinedload(Product.tax), selectinload(Product.variants))
    )
    if is_active is not None:
        query = query.where(Product.is_active == is_active)
    if search:
        like = f"%{search.strip()}%"
        query = query.where(or_(Product.name.ilike(like), Product.type.ilike(like)))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(Product.name.asc(), Product.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: DbSession):
    return _get_product(db, product_id)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(body: ProductCreate, db: DbSession):
    if body.tax_id is not None:
        if db.get(Tax, body.tax_id) is None:
            raise AppError("Selected tax does not exist.", code="validation_error", status_code=400, fields={"tax_id": "Tax not found"})

    product = Product(
        name=body.name,
        type=body.type,
        sales_price=body.sales_price,
        tax_id=body.tax_id,
        is_active=body.is_active,
    )
    for v in body.variants:
        product.variants.append(
            ProductVariant(
                attribute=v.attribute,
                value=v.value,
                extra_price=v.extra_price,
            )
        )
    db.add(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("Variant attributes must be unique per product.", code="validation_error", status_code=400)

    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, body: ProductUpdate, db: DbSession):
    product = _get_product(db, product_id)
    if body.tax_id is not None and db.get(Tax, body.tax_id) is None:
        raise AppError("Selected tax does not exist.", code="validation_error", status_code=400, fields={"tax_id": "Tax not found"})

    apply_update(product, body, ProductBase, skip=("variants",))

    if body.variants is not None:
        # Reconcile by (attribute, value) so unchanged variants keep their ids
        # (subscription/quotation lines reference variant_id).
        incoming: dict[tuple[str, str], object] = {}
        for v in body.variants:
            key = (v.attribute, v.value)
            if key in incoming:
                raise AppError(
                    "Duplicate variant in request.", code="validation_error", status_code=422,
                    fields={"variants": f"Duplicate variant {v.attribute}: {v.value}"},
                )
            incoming[key] = v
        existing = {(v.attribute, v.value): v for v in product.variants}
        for key, variant in existing.items():
            if key not in incoming:
                product.variants.remove(variant)
        for key, v in incoming.items():
            if key in existing:
                existing[key].extra_price = v.extra_price
            else:
                product.variants.append(
                    ProductVariant(attribute=v.attribute, value=v.value, extra_price=v.extra_price)
                )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("Could not save variants: a variant is duplicated or still in use.", code="validation_error", status_code=400)

    db.refresh(product)
    return product
