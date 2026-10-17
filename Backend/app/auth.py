import os
from dataclasses import dataclass
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.database.database import SessionLocal
from app.database.models import (
    OrganizationRecord,
    OrganizationMembershipRecord,
    UserRecord,
)

auth_router = APIRouter()
bearer_scheme = HTTPBearer(auto_error=False)
password_hash = PasswordHash.recommended()


class AuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=255)


@dataclass(frozen=True)
class UserContext:
    workspace_id: str
    user_id: str


def _secret() -> str:
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret or len(secret) < 32:
        raise HTTPException(
            status_code=503,
            detail="JWT_SECRET_KEY must be configured with at least 32 characters.",
        )
    return secret


def _make_token(user: UserRecord, workspace_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": user.id,
            "workspace_id": workspace_id,
            "iat": now,
            "exp": now + timedelta(hours=12),
        },
        _secret(),
        algorithm="HS256",
    )


def _email(value: str) -> str:
    value = value.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return value


def _response(user: UserRecord, workspace_id: str) -> dict:
    return {
        "access_token": _make_token(user, workspace_id),
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
        },
    }


@auth_router.post("/signup", status_code=201)
def signup(payload: AuthRequest):
    email = _email(payload.email)
    db: Session = SessionLocal()
    try:
        existing = db.query(UserRecord).filter(UserRecord.email == email).first()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")

        user_id = str(uuid4())
        workspace_id = f"personal:{user_id}"
        user = UserRecord(
            id=user_id,
            email=email,
            password_hash=password_hash.hash(payload.password),
            name=(payload.name or "").strip() or email.split("@")[0],
            status="active",
        )
        workspace = OrganizationRecord(
            id=workspace_id,
            name=f"{user.name}'s workspace",
            status="active",
        )
        db.add_all([user, workspace])
        db.flush()
        db.add(
            OrganizationMembershipRecord(
                organization_id=workspace_id,
                user_id=user_id,
                role="owner",
            )
        )
        db.commit()
        db.refresh(user)
        return _response(user, workspace_id)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create account.") from exc
    finally:
        db.close()


@auth_router.post("/login")
def login(payload: AuthRequest):
    email = _email(payload.email)
    db: Session = SessionLocal()
    try:
        user = db.query(UserRecord).filter(UserRecord.email == email).first()
        if (
            user is None
            or not user.password_hash
            or not password_hash.verify(payload.password, user.password_hash)
        ):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        if user.status != "active":
            raise HTTPException(status_code=403, detail="This account is disabled.")

        workspace_id = f"personal:{user.id}"
        workspace = db.get(OrganizationRecord, workspace_id)
        if workspace is None or workspace.status != "active":
            raise HTTPException(status_code=403, detail="This workspace is unavailable.")
        return _response(user, workspace_id)
    finally:
        db.close()


@dataclass(frozen=True)
class UserContext:
    workspace_id: str
    user_id: str


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserContext:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="A bearer token is required.")

    try:
        claims = jwt.decode(
            credentials.credentials,
            _secret(),
            algorithms=["HS256"],
        )
        user_id = claims.get("sub")
        workspace_id = claims.get("workspace_id")
        if not isinstance(user_id, str) or not isinstance(workspace_id, str):
            raise HTTPException(status_code=401, detail="Invalid access token.")
    except HTTPException:
        raise
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired access token.") from exc

    db: Session = SessionLocal()
    try:
        user = db.get(UserRecord, user_id)
        workspace = db.get(OrganizationRecord, workspace_id)
        if (
            user is None
            or workspace is None
            or user.status != "active"
            or workspace.status != "active"
            or workspace_id != f"personal:{user_id}"
        ):
            raise HTTPException(status_code=401, detail="Account or workspace is unavailable.")
        return UserContext(workspace_id=workspace_id, user_id=user_id)
    finally:
        db.close()


@auth_router.post("/logout")
def logout(_: UserContext = Depends(get_current_user)):
    # JWTs are stateless; the client must discard its access token.
    return {"message": "Logged out. Discard the access token on the client."}
