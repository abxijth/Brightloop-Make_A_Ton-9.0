from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    ValidationInfo,
    field_validator,
)

from app.security import password_problems

Email = Annotated[EmailStr, StringConstraints(strip_whitespace=True, to_lower=True)]


def _check_password(value: str) -> str:
    problems = password_problems(value)
    if problems:
        raise ValueError("Password needs: " + ", ".join(p.lower() for p in problems))
    return value


def _check_match(value: str, info: ValidationInfo) -> str:
    if value != info.data.get("password"):
        raise ValueError("Passwords do not match")
    return value


class SignupRequest(BaseModel):
    email: Email
    password: str
    confirm_password: str
    full_name: str | None = Field(default=None, max_length=255)

    _password_rules = field_validator("password")(_check_password)

    _confirm = field_validator("confirm_password")(_check_match)


class LoginRequest(BaseModel):
    email: Email
    password: str


class ForgotPasswordRequest(BaseModel):
    email: Email


class ResetPasswordRequest(BaseModel):
    token: str
    password: str
    confirm_password: str

    _password_rules = field_validator("password")(_check_password)

    _confirm = field_validator("confirm_password")(_check_match)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: str

    @field_validator("role", mode="before")
    @classmethod
    def _role_value(cls, v):
        return getattr(v, "value", v)


class MessageOut(BaseModel):
    message: str
