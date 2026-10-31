from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import BillingPeriod, SubscriptionStatus


class SubscriptionLineIn(BaseModel):
    product_id: int
    variant_id: int | None = None
    quantity: int = Field(ge=1)
    unit_price: Decimal | None = Field(default=None, ge=0)


class SubscriptionCreate(BaseModel):
    customer_id: int
    template_id: int | None = None
    plan_id: int | None = None
    start_date: date
    expiry_date: date | None = None
    payment_terms_days: int = Field(default=15, ge=0, le=365)
    lines: list[SubscriptionLineIn] | None = None

    @model_validator(mode="after")
    def _source_and_dates(self):
        if self.template_id is None and self.plan_id is None:
            raise ValueError("Choose a template or a plan")
        if self.template_id is None and not self.lines:
            raise ValueError("Add at least one line")
        if self.expiry_date is not None and self.expiry_date < self.start_date:
            raise ValueError("Expiry date must be on or after the start date")
        return self


class SubscriptionUpdate(BaseModel):
    customer_id: int | None = None
    plan_id: int | None = None
    start_date: date | None = None
    expiry_date: date | None = None
    payment_terms_days: int | None = Field(default=None, ge=0, le=365)
    lines: list[SubscriptionLineIn] | None = None


class SubscriptionTransition(BaseModel):
    target_status: SubscriptionStatus


class SubscriptionLineOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    variant_id: int | None
    variant_label: str | None
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    tax_name: str | None
    tax_rate: Decimal | None
    tax_amount: Decimal


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    id: int
    number: str
    customer_id: int
    customer_name: str
    customer_email: str
    plan_id: int
    plan_name: str
    billing_period: BillingPeriod
    plan_allow_early_close: bool
    plan_auto_close: bool
    status: SubscriptionStatus
    start_date: date
    expiry_date: date | None
    payment_terms_days: int
    next_billing_date: date | None
    lines: list[SubscriptionLineOut]
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal
    allowed_transitions: list[SubscriptionStatus]
    can_close: bool
    created_at: datetime
    updated_at: datetime


class SubscriptionPage(BaseModel):
    items: list[SubscriptionOut]
    total: int
    page: int
    page_size: int


class SubscriptionTemplateLineOut(BaseModel):
    product_id: int
    product_name: str
    variant_id: int | None
    variant_label: str | None
    quantity: int


class SubscriptionTemplateOut(BaseModel):
    id: int
    name: str
    plan_id: int
    plan_name: str
    validity_days: int
    lines: list[SubscriptionTemplateLineOut]
