from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.auth import Email


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class CustomerBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    company: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=2000)

    _blank = field_validator("company", "phone", "address", mode="before")(_blank_to_none)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v


class CustomerCreate(CustomerBase):
    email: Email


class CustomerUpdate(BaseModel):
    """Partial update; only the fields sent are changed."""

    name: str | None = Field(default=None, max_length=255)
    email: Email | None = None
    company: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=2000)

    _blank = field_validator("company", "phone", "address", mode="before")(_blank_to_none)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v


class CustomerSelfUpdate(BaseModel):
    """What a customer may change on their own profile (not the email)."""

    name: str | None = Field(default=None, max_length=255)
    company: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = Field(default=None, max_length=2000)

    _blank = field_validator("company", "phone", "address", mode="before")(_blank_to_none)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return CustomerUpdate._name(v)


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    name: str
    company: str | None
    email: str
    phone: str | None
    address: str | None
    created_at: datetime
    updated_at: datetime


class CustomerDetail(CustomerOut):
    outstanding_balance: Decimal


class CustomerPage(BaseModel):
    items: list[CustomerOut]
    total: int
    page: int
    page_size: int
