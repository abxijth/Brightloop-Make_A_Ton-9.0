import secrets
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import clear_auth_cookie, get_current_user, set_auth_cookie
from app.config import settings
from app.db import get_db
from app.errors import AppError
from app.models import Customer, EmailType, Outbox, PasswordResetToken, User, UserRole
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageOut,
    ResetPasswordRequest,
    SignupRequest,
    UserOut,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

RESET_TOKEN_TTL = timedelta(hours=1)
FORGOT_PASSWORD_MESSAGE = "If that email is registered, a reset link has been sent."

DbSession = Annotated[Session, Depends(get_db)]


def _login(response: Response, user: User) -> None:
    set_auth_cookie(response, create_access_token(user.id, user.role.value))


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, response: Response, db: DbSession):
    if db.scalar(select(User.id).where(User.email == body.email)):
        raise AppError(
            "Please fix the highlighted fields.",
            code="validation_error",
            status_code=409,
            fields={"email": "Email is already registered"},
        )

    full_name = body.full_name or body.email.split("@")[0]
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=full_name,
        role=UserRole.CUSTOMER,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # lost a race with a concurrent signup
        db.rollback()
        raise AppError(
            "Please fix the highlighted fields.",
            code="validation_error",
            status_code=409,
            fields={"email": "Email is already registered"},
        )

    # Staff may have created the customer profile before the person signed up.
    customer = db.scalar(
        select(Customer).where(Customer.email == body.email, Customer.user_id.is_(None))
    )
    if customer:
        customer.user_id = user.id
    else:
        db.add(Customer(user_id=user.id, name=full_name, email=body.email))
    db.commit()

    _login(response, user)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: DbSession):
    user = db.scalar(select(User).where(User.email == body.email))
    # Same answer for unknown email, wrong password and deactivated account.
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        raise AppError("Invalid email or password", code="invalid_credentials", status_code=401)
    _login(response, user)
    return user


@router.post("/logout", response_model=MessageOut)
def logout(response: Response):
    clear_auth_cookie(response)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserOut)
def me(user: Annotated[User, Depends(get_current_user)]):
    return user


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(body: ForgotPasswordRequest, db: DbSession):
    user = db.scalar(select(User).where(User.email == body.email, User.is_active.is_(True)))
    if user:
        token = secrets.token_urlsafe(32)
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token=token,
                expires_at=datetime.now(timezone.utc) + RESET_TOKEN_TTL,
            )
        )
        link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
        db.add(
            Outbox(
                type=EmailType.PASSWORD_RESET,
                to_email=user.email,
                subject="Reset your Brightloop password",
                body_html=(
                    f"<p>Hi {escape(user.full_name)},</p>"
                    f'<p><a href="{link}">Reset your password</a></p>'
                    "<p>This link works once and expires in 1 hour.</p>"
                ),
            )
        )
        db.commit()
    return {"message": FORGOT_PASSWORD_MESSAGE}


@router.post("/reset-password", response_model=MessageOut)
def reset_password(body: ResetPasswordRequest, db: DbSession):
    record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token == body.token).with_for_update()
    )
    now = datetime.now(timezone.utc)
    if record is None or record.used_at is not None or record.expires_at <= now:
        raise AppError(
            "This reset link is invalid or has expired.",
            code="invalid_token",
            status_code=400,
            fields={"token": "Reset link is invalid or expired"},
        )
    record.user.password_hash = hash_password(body.password)
    record.used_at = now
    db.commit()
    return {"message": "Password updated. You can now log in."}
