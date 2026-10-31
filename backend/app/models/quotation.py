from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.catalog import Plan, Product, ProductVariant


class QuotationTemplate(Base):
    __tablename__ = "quotation_templates"
    __table_args__ = (
        CheckConstraint(
            "validity_days > 0", name="ck_quotation_templates_validity_days_positive"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    plan_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("plans.id"), nullable=False
    )
    validity_days: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    plan: Mapped[Plan] = relationship("Plan")
    lines: Mapped[list[QuotationTemplateLine]] = relationship(
        "QuotationTemplateLine",
        back_populates="template",
        cascade="all, delete-orphan",
    )


class QuotationTemplateLine(Base):
    __tablename__ = "quotation_template_lines"
    __table_args__ = (
        CheckConstraint(
            "quantity > 0", name="ck_quotation_template_lines_quantity_positive"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("quotation_templates.id"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id"), nullable=False
    )
    variant_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("product_variants.id"), nullable=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    template: Mapped[QuotationTemplate] = relationship(
        "QuotationTemplate", back_populates="lines"
    )
    product: Mapped[Product] = relationship("Product")
    variant: Mapped[ProductVariant | None] = relationship("ProductVariant")
