from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.auth import Email, _check_password


class StaffCreate(BaseModel):
    email: Email
    full_name: str = Field(min_length=1, max_length=255)
    password: str
    role: str = "staff"

    _password_rules = field_validator("password")(_check_password)

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ("staff", "admin"):
            raise ValueError("Role must be staff or admin")
        return v


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    @field_validator("role", mode="before")
    @classmethod
    def _role_value(cls, v):
        return getattr(v, "value", v)


class StaffPage(BaseModel):
    items: list[StaffOut]
    total: int
    page: int
    page_size: int
