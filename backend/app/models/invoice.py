from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Sequence,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import InvoiceLineType, InvoiceStatus, enum_values

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.discount import DiscountRule
    from app.models.payment import Payment
    from app.models.subscription import Subscription


invoice_number_seq = Sequence("invoice_number_seq", metadata=Base.metadata)


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint(
            "subscription_id",
            "period_start",
            name="uq_invoices_subscription_period",
        ),
        CheckConstraint(
            "period_end >= period_start", name="ck_invoices_period_end_after_start"
        ),
        CheckConstraint("total >= 0", name="ck_invoices_total_non_negative"),
        CheckConstraint(
            "amount_paid >= 0 AND amount_paid <= total",
            name="ck_invoices_amount_paid_within_total",
        ),
        Index("ix_invoices_status_due_date", "status", "due_date"),
        Index("ix_invoices_customer_id", "customer_id"),
        Index("ix_invoices_issue_date", "issue_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    number: Mapped[str] = mapped_column(String(50), nullable=False)
    subscription_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("subscriptions.id"), nullable=False
    )
    customer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("customers.id"), nullable=False
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(
        SAEnum(InvoiceStatus, name="invoice_status", values_callable=enum_values),
        nullable=False,
        default=InvoiceStatus.DRAFT,
    )
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
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

    subscription: Mapped[Subscription] = relationship(
        "Subscription", back_populates="invoices"
    )
    customer: Mapped[Customer] = relationship("Customer")
    lines: Mapped[list[InvoiceLine]] = relationship(
        "InvoiceLine", back_populates="invoice", cascade="all, delete-orphan"
    )
    payments: Mapped[list[Payment]] = relationship(
        "Payment", back_populates="invoice"
    )


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    __table_args__ = (
        Index(
            "uq_invoice_lines_invoice_discount",
            "invoice_id",
            "discount_rule_id",
            unique=True,
            postgresql_where=text("line_type = 'discount'"),
        ),
        Index("ix_invoice_lines_discount_rule_id", "discount_rule_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    line_type: Mapped[InvoiceLineType] = mapped_column(
        SAEnum(
            InvoiceLineType,
            name="invoice_line_type",
            values_callable=enum_values,
        ),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_rule_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("discount_rules.id"), nullable=True
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

    invoice: Mapped[Invoice] = relationship("Invoice", back_populates="lines")
    discount_rule: Mapped[DiscountRule | None] = relationship("DiscountRule")
