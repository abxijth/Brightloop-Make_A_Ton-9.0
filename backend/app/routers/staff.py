"""Staff management (admin only). Staff are deactivated, never deleted."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.db import get_db
from app.errors import AppError
from app.models import User, UserRole
from app.schemas.staff import StaffCreate, StaffOut, StaffPage
from app.security import hash_password

router = APIRouter(prefix="/staff", tags=["staff"], dependencies=[Depends(require_admin)])

DbSession = Annotated[Session, Depends(get_db)]
STAFF_ROLES = (UserRole.STAFF, UserRole.ADMIN)


def _email_taken() -> AppError:
    return AppError(
        "Please fix the highlighted fields.",
        code="validation_error",
        status_code=409,
        fields={"email": "Email is already registered"},
    )


def _get_staff(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or user.role not in STAFF_ROLES:
        raise AppError("Staff member not found.", code="not_found", status_code=404)
    return user


@router.get("", response_model=StaffPage)
def list_staff(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    search: Annotated[str | None, Query(max_length=200)] = None,
    include_inactive: bool = True,
):
    query = select(User).where(User.role.in_(STAFF_ROLES))
    if not include_inactive:
        query = query.where(User.is_active.is_(True))
    if search:
        like = f"%{search.strip()}%"
        query = query.where(or_(User.email.ilike(like), User.full_name.ilike(like)))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(User.full_name, User.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
def create_staff(body: StaffCreate, db: DbSession):
    if db.scalar(select(User.id).where(User.email == body.email)):
        raise _email_taken()
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=UserRole(body.role),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _email_taken()
    return user


@router.post("/{user_id}/deactivate", response_model=StaffOut)
def deactivate_staff(
    user_id: int, db: DbSession, current: Annotated[User, Depends(get_current_user)]
):
    user = _get_staff(db, user_id)
    if user.id == current.id:
        raise AppError("You cannot deactivate your own account.", code="bad_request")
    user.is_active = False
    db.commit()
    return user


@router.post("/{user_id}/activate", response_model=StaffOut)
def activate_staff(user_id: int, db: DbSession):
    user = _get_staff(db, user_id)
    user.is_active = True
    db.commit()
    return user
