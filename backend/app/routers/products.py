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
from app.schemas.catalog import ProductCreate, ProductOut, ProductPage, ProductUpdate

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
    if body.tax_id is not None:
        if db.get(Tax, body.tax_id) is None:
            raise AppError("Selected tax does not exist.", code="validation_error", status_code=400, fields={"tax_id": "Tax not found"})

    if body.name is not None:
        product.name = body.name
    if body.type is not None:
        product.type = body.type
    if body.sales_price is not None:
        product.sales_price = body.sales_price
    if body.tax_id is not None:
        product.tax_id = body.tax_id
    if body.is_active is not None:
        product.is_active = body.is_active

    if body.variants is not None:
        # Reconcile variants
        product.variants.clear()
        for v in body.variants:
            product.variants.append(
                ProductVariant(
                    attribute=v.attribute,
                    value=v.value,
                    extra_price=v.extra_price,
                )
            )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("Variant attributes must be unique per product.", code="validation_error", status_code=400)

    db.refresh(product)
    return product
