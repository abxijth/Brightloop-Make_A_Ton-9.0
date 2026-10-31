from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import InvoiceLineType, InvoiceStatus, PaymentMethod


class InvoiceLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    line_type: InvoiceLineType
    description: str
    quantity: int
    unit_price: Decimal
    tax_name: str | None = None
    tax_rate: Decimal | None = None
    tax_amount: Decimal
    line_total: Decimal
    discount_rule_id: int | None = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    customer_id: int
    method: PaymentMethod
    amount: Decimal
    payment_date: date
    note: str | None = None
    recorded_by_id: int | None = None
    created_at: datetime


class PaymentWithMetaOut(PaymentOut):
    invoice_number: str | None = None
    customer_name: str | None = None


class PaymentPage(BaseModel):
    items: list[PaymentWithMetaOut]
    total: int
    page: int
    page_size: int


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str
    subscription_id: int
    customer_id: int
    customer_name: str | None = None
    customer_email: str | None = None
    period_start: date
    period_end: date
    status: InvoiceStatus
    issue_date: date
    due_date: date
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    amount_paid: Decimal
    amount_due: Decimal
    created_at: datetime
    updated_at: datetime


class InvoiceDetailOut(InvoiceOut):
    lines: list[InvoiceLineOut] = []
    payments: list[PaymentOut] = []


class InvoicePage(BaseModel):
    items: list[InvoiceOut]
    total: int
    page: int
    page_size: int


class RecordPaymentRequest(BaseModel):
    amount: Annotated[Decimal, Field(gt=Decimal("0"))]
    method: PaymentMethod = PaymentMethod.BANK_TRANSFER
    payment_date: date | None = None
    note: str | None = Field(default=None, max_length=1000)
