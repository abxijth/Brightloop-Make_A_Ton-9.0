"""Schemas for Taxes, Products, Variants, Plans, and Discount Rules."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import BillingPeriod, DiscountScope, ValueType


# ---------------------------------------------------------------------------
# Taxes
# ---------------------------------------------------------------------------

class TaxBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: ValueType
    value: Decimal = Field(ge=0)
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v

    @model_validator(mode="after")
    def _validate_tax_value(self) -> "TaxBase":
        if self.type == ValueType.PERCENT and self.value > Decimal("100.00"):
            raise ValueError("Percentage tax rate cannot exceed 100%")
        return self


class TaxCreate(TaxBase):
    pass


class TaxUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: ValueType | None = None
    value: Decimal | None = Field(default=None, ge=0)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Name cannot be empty")
        return v

    @model_validator(mode="after")
    def _validate_tax_value(self) -> "TaxUpdate":
        if self.type == ValueType.PERCENT and self.value is not None and self.value > Decimal("100.00"):
            raise ValueError("Percentage tax rate cannot exceed 100%")
        return self


class TaxOut(TaxBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class TaxPage(BaseModel):
    items: list[TaxOut]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Product Variants & Products
# ---------------------------------------------------------------------------

class VariantBase(BaseModel):
    attribute: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=255)
    extra_price: Decimal = Field(default=Decimal("0.00"), ge=0)

    @field_validator("attribute", "value")
    @classmethod
    def _strip_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Field cannot be empty")
        return v


class VariantCreate(VariantBase):
    pass


class VariantOut(VariantBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    created_at: datetime
    updated_at: datetime


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(default="service", min_length=1, max_length=100)
    sales_price: Decimal = Field(ge=0)
    tax_id: int | None = None
    is_active: bool = True

    @field_validator("name", "type")
    @classmethod
    def _strip_fields(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Field cannot be empty")
        return v


class ProductCreate(ProductBase):
    variants: list[VariantCreate] = Field(default_factory=list)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: str | None = Field(default=None, min_length=1, max_length=100)
    sales_price: Decimal | None = Field(default=None, ge=0)
    tax_id: int | None = None
    is_active: bool | None = None
    variants: list[VariantCreate] | None = None

    @field_validator("name", "type")
    @classmethod
    def _strip_fields(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Field cannot be empty")
        return v


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tax: TaxOut | None = None
    variants: list[VariantOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProductPage(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------

class PlanBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    price: Decimal = Field(ge=0)
    billing_period: BillingPeriod
    min_quantity: int = Field(default=1, ge=1)
    available_from: date
    available_to: date | None = None
    auto_close: bool = False
    allow_early_close: bool = False
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty")
        return v

    @model_validator(mode="after")
    def _validate_dates(self) -> "PlanBase":
        if self.available_to is not None and self.available_to < self.available_from:
            raise ValueError("available_to cannot be earlier than available_from")
        return self


class PlanCreate(PlanBase):
    pass


class PlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    price: Decimal | None = Field(default=None, ge=0)
    billing_period: BillingPeriod | None = None
    min_quantity: int | None = Field(default=None, ge=1)
    available_from: date | None = None
    available_to: date | None = None
    auto_close: bool | None = None
    allow_early_close: bool | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Name cannot be empty")
        return v

    @model_validator(mode="after")
    def _validate_dates(self) -> "PlanUpdate":
        if self.available_to is not None and self.available_from is not None:
            if self.available_to < self.available_from:
                raise ValueError("available_to cannot be earlier than available_from")
        return self


class PlanOut(PlanBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class PlanPage(BaseModel):
    items: list[PlanOut]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Discount Rules
# ---------------------------------------------------------------------------

class DiscountRuleBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: ValueType
    value: Decimal = Field(gt=0)
    min_purchase: Decimal | None = Field(default=None, ge=0)
    min_quantity: int | None = Field(default=None, ge=1)
    start_date: date
    end_date: date | None = None
    usage_limit: int | None = Field(default=None, ge=1)
    scope: DiscountScope = DiscountScope.SUBSCRIPTION
    product_id: int | None = None
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty")
        return v

    @model_validator(mode="after")
    def _validate_rule(self) -> "DiscountRuleBase":
        if self.type == ValueType.PERCENT and self.value > Decimal("100.00"):
            raise ValueError("Percentage discount cannot exceed 100%")
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        if self.scope == DiscountScope.PRODUCT and self.product_id is None:
            raise ValueError("product_id is required when scope is 'product'")
        return self


class DiscountRuleCreate(DiscountRuleBase):
    pass


class DiscountRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: ValueType | None = None
    value: Decimal | None = Field(default=None, gt=0)
    min_purchase: Decimal | None = Field(default=None, ge=0)
    min_quantity: int | None = Field(default=None, ge=1)
    start_date: date | None = None
    end_date: date | None = None
    usage_limit: int | None = Field(default=None, ge=1)
    scope: DiscountScope | None = None
    product_id: int | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Name cannot be empty")
        return v

    @model_validator(mode="after")
    def _validate_rule(self) -> "DiscountRuleUpdate":
        if self.type == ValueType.PERCENT and self.value is not None and self.value > Decimal("100.00"):
            raise ValueError("Percentage discount cannot exceed 100%")
        if self.end_date is not None and self.start_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date cannot be earlier than start_date")
        if self.scope == DiscountScope.PRODUCT and self.product_id is None:
            raise ValueError("product_id is required when scope is 'product'")
        return self


class DiscountRuleOut(DiscountRuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    used_count: int = 0
    status: str = "active"  # "active", "expired", "exhausted", "inactive"
    product_name: str | None = None
    created_at: datetime
    updated_at: datetime


class DiscountRulePage(BaseModel):
    items: list[DiscountRuleOut]
    total: int
    page: int
    page_size: int
