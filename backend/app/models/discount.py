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
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import DiscountScope, ValueType, enum_values

if TYPE_CHECKING:
    from app.models.catalog import Product


class DiscountRule(Base):
    __tablename__ = "discount_rules"
    __table_args__ = (
        CheckConstraint("value > 0", name="ck_discount_rules_value_positive"),
        CheckConstraint(
            "type <> 'percent' OR value <= 100",
            name="ck_discount_rules_percent_max",
        ),
        CheckConstraint(
            "end_date IS NULL OR end_date >= start_date",
            name="ck_discount_rules_end_date_after_start",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[ValueType] = mapped_column(
        SAEnum(ValueType, name="value_type", values_callable=enum_values),
        nullable=False,
    )
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    min_purchase: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    min_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    usage_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scope: Mapped[DiscountScope] = mapped_column(
        SAEnum(DiscountScope, name="discount_scope", values_callable=enum_values),
        nullable=False,
    )
    product_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("products.id"), nullable=True
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

    product: Mapped[Product | None] = relationship("Product")
