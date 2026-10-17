from datetime import datetime
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import HTTPException

from app import main
from app.auth import UserContext
from app.database.models import PolicyGroupRecord, PolicyRecord


GROUP_ID = UUID("12345678-1234-5678-1234-567812345678")


class FakeQuery:
    def __init__(self, result):
        self.result = result

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        return self

    def one_or_none(self):
        return self.result


class FakeDB:
    def __init__(self, group, target, previous=None):
        self.group = group
        self.target = target
        self.previous = previous
        self.policy_query_count = 0
        self.added = []
        self.committed = False

    def query(self, model):
        if model is PolicyGroupRecord:
            return FakeQuery(self.group)

        if model is PolicyRecord:
            self.policy_query_count += 1
            if self.policy_query_count == 1:
                return FakeQuery(self.target)
            return FakeQuery(self.previous)

        raise AssertionError(f"Unexpected query model: {model}")

    def add(self, record):
        self.added.append(record)

    def commit(self):
        self.committed = True


def make_context():
    return UserContext(
        workspace_id="workspace_test",
        user_id="user_test",
    )


def make_group():
    return SimpleNamespace(
        id=str(GROUP_ID),
        organization_id="workspace_test",
        name="Refund Policy",
    )


def make_rule(
    rule_id="refund_001",
    requires_review=False,
    conditions=None,
):
    return SimpleNamespace(
        rule_id=rule_id,
        action="refund",
        conditions=(
            [{"field": "amount", "operator": "<", "value": 10000}]
            if conditions is None
            else conditions
        ),
        decision="APPROVE",
        reason="Refund is within the permitted limit.",
        priority=10,
        source="Refund policy section 1",
        requires_review=requires_review,
        review_notes=["Manager review required"] if requires_review else [],
    )


def make_policy(status="draft", rules=None, version_number=1):
    group = make_group()
    return SimpleNamespace(
        id=101,
        policy_group_id=str(GROUP_ID),
        policy_group=group,
        status=status,
        rules=rules if rules is not None else [],
        version_number=version_number,
        filename="refund-policy.pdf",
        pages=1,
        characters=200,
        is_active=False,
        created_at=datetime(2026, 1, 1),
        activated_at=None,
        activated_by_user_id=None,
    )


def test_failed_policy_version_cannot_be_activated():
    group = make_group()
    target = make_policy(status="failed")
    db = FakeDB(group, target)

    with pytest.raises(HTTPException) as exc:
        main._activate_policy_version(
            db, GROUP_ID, target.id, make_context(), "activate"
        )

    assert exc.value.status_code == 409
    assert "successfully processed" in exc.value.detail
    assert not db.committed


def test_policy_with_review_required_rule_cannot_be_activated():
    group = make_group()
    target = make_policy(rules=[make_rule(requires_review=True)])
    db = FakeDB(group, target)

    with pytest.raises(HTTPException) as exc:
        main._activate_policy_version(
            db, GROUP_ID, target.id, make_context(), "activate"
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["rule_ids"] == ["refund_001"]
    assert not db.committed


def test_policy_with_invalid_rules_cannot_be_activated():
    group = make_group()
    target = make_policy(
        rules=[make_rule(conditions=[])],
    )
    db = FakeDB(group, target)

    with pytest.raises(HTTPException) as exc:
        main._activate_policy_version(
            db, GROUP_ID, target.id, make_context(), "activate"
        )

    assert exc.value.status_code == 409
    assert "failed validation" in exc.value.detail
    assert not db.committed


def test_valid_policy_can_be_activated():
    group = make_group()
    target = make_policy(rules=[make_rule()])
    db = FakeDB(group, target, previous=None)

    result = main._activate_policy_version(
        db, GROUP_ID, target.id, make_context(), "activate"
    )

    assert result["status"] == "active"
    assert result["is_active"] is True
    assert target.status == "active"
    assert target.is_active is True
    assert target.activated_by_user_id == "user_test"
    assert db.committed
    assert len(db.added) == 1
    assert db.added[0].action == "activate"
