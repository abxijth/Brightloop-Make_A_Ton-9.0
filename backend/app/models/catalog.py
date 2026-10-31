from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import BillingPeriod, enum_values

if TYPE_CHECKING:
    from app.models.tax import Tax


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("sales_price >= 0", name="ck_products_sales_price_non_negative"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    sales_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("taxes.id"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    tax: Mapped[Tax | None] = relationship("Tax", back_populates="products")
    variants: Mapped[list[ProductVariant]] = relationship(
        "ProductVariant", back_populates="product", cascade="all, delete-orphan"
    )


class ProductVariant(Base):
    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "attribute",
            "value",
            name="uq_product_variants_product_attribute_value",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id"), nullable=False
    )
    attribute: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    extra_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    product: Mapped[Product] = relationship("Product", back_populates="variants")


class Plan(Base):
    __tablename__ = "plans"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_plans_price_non_negative"),
        CheckConstraint("min_quantity >= 1", name="ck_plans_min_quantity_positive"),
        CheckConstraint(
            "available_to IS NULL OR available_to >= available_from",
            name="ck_plans_available_to_after_from",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    billing_period: Mapped[BillingPeriod] = mapped_column(
        SAEnum(BillingPeriod, name="billing_period", values_callable=enum_values),
        nullable=False,
    )
    min_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    available_from: Mapped[date] = mapped_column(Date, nullable=False)
    available_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    auto_close: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allow_early_close: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
