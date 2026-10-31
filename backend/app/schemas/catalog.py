from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ValueKind = Literal["percent", "fixed"]
Period = Literal["daily", "weekly", "monthly", "yearly"]
Scope = Literal["subscription", "product"]


def _value(v):
    return getattr(v, "value", v)


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _name(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Name is required")
    return v


# --- Taxes ---


class TaxIn(BaseModel):
    name: str = Field(max_length=255)
    type: ValueKind
    value: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    is_active: bool = True

    _n = field_validator("name")(_name)

    @model_validator(mode="after")
    def _percent_max(self):
        if self.type == "percent" and self.value > 100:
            raise ValueError("Percentage cannot exceed 100")
        return self


class TaxOut(_Out):
    id: int
    name: str
    type: ValueKind
    value: Decimal
    is_active: bool
    created_at: datetime

    _t = field_validator("type", mode="before")(_value)


# --- Products ---


class VariantIn(BaseModel):
    attribute: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=255)
    extra_price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)


class VariantOut(_Out):
    id: int
    attribute: str
    value: str
    extra_price: Decimal


class ProductIn(BaseModel):
    name: str = Field(max_length=255)
    type: str = Field(min_length=1, max_length=100)
    sales_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    tax_id: int | None = None
    is_active: bool = True
    variants: list[VariantIn] = []

    _n = field_validator("name")(_name)


class ProductOut(_Out):
    id: int
    name: str
    type: str
    sales_price: Decimal
    tax_id: int | None
    tax: TaxOut | None
    is_active: bool
    variants: list[VariantOut]
    created_at: datetime


# --- Plans ---


class PlanIn(BaseModel):
    name: str = Field(max_length=255)
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    billing_period: Period
    min_quantity: int = Field(default=1, ge=1)
    available_from: date
    available_to: date | None = None
    auto_close: bool = False
    allow_early_close: bool = False
    is_active: bool = True

    _n = field_validator("name")(_name)

    @model_validator(mode="after")
    def _range(self):
        if self.available_to and self.available_to < self.available_from:
            raise ValueError("Available to must be on or after available from")
        return self


class PlanOut(_Out):
    id: int
    name: str
    price: Decimal
    billing_period: Period
    min_quantity: int
    available_from: date
    available_to: date | None
    auto_close: bool
    allow_early_close: bool
    is_active: bool
    created_at: datetime

    _p = field_validator("billing_period", mode="before")(_value)


# --- Discounts ---


class DiscountIn(BaseModel):
    name: str = Field(max_length=255)
    type: ValueKind
    value: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    min_purchase: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    min_quantity: int | None = Field(default=None, ge=1)
    start_date: date
    end_date: date | None = None
    usage_limit: int | None = Field(default=None, ge=1)
    scope: Scope
    product_id: int | None = None
    is_active: bool = True

    _n = field_validator("name")(_name)

    @model_validator(mode="after")
    def _rules(self):
        if self.type == "percent" and self.value > 100:
            raise ValueError("Percentage cannot exceed 100")
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("End date must be on or after start date")
        if self.scope == "product" and self.product_id is None:
            raise ValueError("Choose a product for a product discount")
        if self.scope == "subscription":
            self.product_id = None
        return self


class DiscountOut(_Out):
    id: int
    name: str
    type: ValueKind
    value: Decimal
    min_purchase: Decimal | None
    min_quantity: int | None
    start_date: date
    end_date: date | None
    usage_limit: int | None
    times_used: int = 0
    scope: Scope
    product_id: int | None
    product_name: str | None = None
    is_active: bool
    created_at: datetime

    _t = field_validator("type", "scope", mode="before")(_value)
