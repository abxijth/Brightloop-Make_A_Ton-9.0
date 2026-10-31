import re
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import settings

COOKIE_NAME = "access_token"
_JWT_ALGORITHM = "HS256"
_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def password_problems(password: str) -> list[str]:
    """Rules behind the live signup checklist. Empty list means the password is valid."""
    rules = [
        (len(password) >= 8, "At least 8 characters"),
        (re.search(r"[A-Z]", password), "One uppercase letter"),
        (re.search(r"[a-z]", password), "One lowercase letter"),
        (re.search(r"\d", password), "One number"),
        (re.search(r"[^A-Za-z0-9]", password), "One special character"),
    ]
    return [label for ok, label in rules if not ok]


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[_JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
