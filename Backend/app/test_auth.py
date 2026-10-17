import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import auth
from app.database.models import OrganizationRecord, UserRecord


class FakeSession:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get(self, model, record_id):
        if model is UserRecord and record_id == self.user_id:
            return UserRecord(
                id=self.user_id,
                email=f"{self.user_id}@example.com",
                name=self.user_id,
                status="active",
            )

        if (
            model is OrganizationRecord
            and record_id == f"personal:{self.user_id}"
        ):
            return OrganizationRecord(
                id=record_id,
                name=f"{self.user_id}'s workspace",
                status="active",
            )

        return None

    def close(self):
        pass


def make_token(user_id: str, secret: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "workspace_id": f"personal:{user_id}",
        },
        secret,
        algorithm="HS256",
    )


def test_authenticated_user_gets_private_workspace(monkeypatch):
    secret = "test-secret-key-that-is-at-least-32-characters"
    monkeypatch.setenv("JWT_SECRET_KEY", secret)

    database = FakeSession("user_123")
    monkeypatch.setattr(auth, "SessionLocal", lambda: database)

    context = auth.get_current_user(
        HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=make_token("user_123", secret),
        )
    )

    assert context.user_id == "user_123"
    assert context.workspace_id == "personal:user_123"


def test_each_authenticated_user_gets_a_separate_workspace(monkeypatch):
    secret = "test-secret-key-that-is-at-least-32-characters"
    monkeypatch.setenv("JWT_SECRET_KEY", secret)

    workspaces = []

    for user_id in ("user_one", "user_two"):
        database = FakeSession(user_id)
        monkeypatch.setattr(auth, "SessionLocal", lambda db=database: db)

        context = auth.get_current_user(
            HTTPAuthorizationCredentials(
                scheme="Bearer",
                credentials=make_token(user_id, secret),
            )
        )
        workspaces.append(context.workspace_id)

    assert workspaces == [
        "personal:user_one",
        "personal:user_two",
    ]


def test_missing_bearer_token_is_rejected():
    with pytest.raises(HTTPException) as error:
        auth.get_current_user(None)

    assert error.value.status_code == 401


def test_invalid_token_is_rejected(monkeypatch):
    monkeypatch.setenv(
        "JWT_SECRET_KEY",
        "test-secret-key-that-is-at-least-32-characters",
    )

    with pytest.raises(HTTPException) as error:
        auth.get_current_user(
            HTTPAuthorizationCredentials(
                scheme="Bearer",
                credentials="not-a-valid-jwt",
            )
        )

    assert error.value.status_code == 401


def test_user_cannot_claim_another_users_workspace(monkeypatch):
    secret = "test-secret-key-that-is-at-least-32-characters"
    monkeypatch.setenv("JWT_SECRET_KEY", secret)
    monkeypatch.setattr(
        auth,
        "SessionLocal",
        lambda: FakeSession("user_one"),
    )

    token = jwt.encode(
        {
            "sub": "user_one",
            "workspace_id": "personal:user_two",
        },
        secret,
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as error:
        auth.get_current_user(
            HTTPAuthorizationCredentials(
                scheme="Bearer",
                credentials=token,
            )
        )

    assert error.value.status_code == 401
