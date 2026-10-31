"""Auth dependencies used by every router.

    from app.auth import require_admin, require_staff_or_admin, require_customer, get_current_user

Roles are enforced here, server-side. Customer-role endpoints must also filter
their queries to `current_customer(...)`'s own rows.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.security import COOKIE_NAME, decode_access_token


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def get_current_user(request: Request, db: Annotated[Session, Depends(get_db)]):
    token = request.cookies.get(COOKIE_NAME)
    payload = decode_access_token(token) if token else None
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    # Imported here so this module loads before Member 2's User model exists.
    from app.models.user import User

    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user


CurrentUser = Annotated[object, Depends(get_current_user)]


def _require_roles(*roles: str):
    def dependency(user=Depends(get_current_user)):
        if getattr(user.role, "value", user.role) not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this")
        return user

    return dependency


require_admin = _require_roles("admin")
require_staff_or_admin = _require_roles("admin", "staff")
require_customer = _require_roles("customer")
