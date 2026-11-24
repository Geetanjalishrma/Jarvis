"""
auth.py — password hashing + JWT login

CHANGES vs. old version:
- Uses the `bcrypt` package directly instead of passlib. passlib is
  unmaintained and crashes with bcrypt >= 4.1 / 5.x, which was a common
  reason for "register/login returns 500".
- SECRET_KEY is read from backend/.env (falls back to the old value).
- Passwords are cut to bcrypt's 72-byte limit so long passwords don't crash.
"""
import os
from datetime import datetime, timedelta
from pathlib import Path

import bcrypt
from jose import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from database import get_db
from models import User

SECRET_KEY        = os.getenv("SECRET_KEY") or "jarvis-secret-change-this-in-production"
ALGORITHM         = "HS256"
TOKEN_EXPIRE_DAYS = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _to_bytes(password: str) -> bytes:
    # bcrypt only looks at the first 72 bytes
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bytes(plain), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Decode JWT token and return the current user."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
