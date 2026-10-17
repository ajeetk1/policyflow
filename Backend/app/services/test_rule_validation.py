import pytest

from app.policy.rules import PolicyCondition, PolicyRule
from app.services.rule_validation import validate_extracted_rules


def make_rule(
    rule_id: str = "refund_001",
    *,
    field: str = "amount",
    operator: str = "<",
    value: int | bool = 10000,
) -> PolicyRule:
    return PolicyRule(
        rule_id=rule_id,
        action="refund",
        conditions=[PolicyCondition(field=field, operator=operator, value=value)],
        decision="APPROVE",
        reason="Within policy limit.",
        priority=10,
    )


def test_accepts_complete_supported_rule_set() -> None:
    validate_extracted_rules(["refund_001"], [make_rule()])


def test_rejects_missing_extracted_rule() -> None:
    with pytest.raises(ValueError, match="incomplete"):
        validate_extracted_rules(["refund_001", "refund_002"], [make_rule()])


def test_rejects_duplicate_rule_ids() -> None:
    with pytest.raises(ValueError, match="duplicate rule IDs"):
        validate_extracted_rules(
            ["refund_001", "refund_001"],
            [make_rule(), make_rule()],
        )


def test_rejects_boolean_as_numeric_threshold() -> None:
    with pytest.raises(ValueError, match="non-numeric threshold"):
        validate_extracted_rules(
            ["refund_001"],
            [make_rule(value=True)],
        )


def test_rejects_unknown_condition_field() -> None:
    with pytest.raises(ValueError, match="unsupported field"):
        validate_extracted_rules(
            ["refund_001"],
            [make_rule(field="customer_id", value=1)],
        )
