import pytest

from app.policy.rules import PolicyCondition, PolicyRule
from app.policy.evaluator import find_matching_rules


@pytest.mark.parametrize(
    ("facts", "expected"),
    [
        (
            {"days_since_purchase": 5, "fraud_indicator": False},
            "return_within_7_days",
        ),
        (
            {"days_since_purchase": 10, "fraud_indicator": False},
            None,
        ),
        (
            {"days_since_purchase": 5, "fraud_indicator": True},
            "fraud_review",
        ),
    ],
)
def test_return_policy_scenarios(facts, expected):
    rules = [
        PolicyRule(
            rule_id="return_within_7_days",
            action="return",
            conditions=[
                PolicyCondition(
                    field="days_since_purchase",
                    operator="<=",
                    value=7,
                ),
                PolicyCondition(
                    field="fraud_indicator",
                    operator="==",
                    value=False,
                ),
            ],
            decision="approve",
            reason="Return within seven days",
            priority=10,
        ),
        PolicyRule(
            rule_id="fraud_review",
            action="return",
            conditions=[
                PolicyCondition(
                    field="fraud_indicator",
                    operator="==",
                    value=True,
                ),
            ],
            decision="manual_review",
            reason="Fraud requires review",
            priority=100,
        ),
    ]

    matches = find_matching_rules(rules, "return", facts)

    if expected is None:
        assert matches == []
    else:
        assert matches
        assert matches[0].rule_id == expected


def test_other_actions_do_not_match():
    rule = PolicyRule(
        rule_id="refund_rule",
        action="refund",
        conditions=[],
        decision="approve",
        reason="Refund rule",
    )

    assert find_matching_rules([rule], "return", {}) == []


def test_higher_priority_rule_matches_first():
    rules = [
        PolicyRule(
            rule_id="low",
            action="return",
            conditions=[],
            decision="approve",
            reason="Low priority",
            priority=1,
        ),
        PolicyRule(
            rule_id="high",
            action="return",
            conditions=[],
            decision="manual_review",
            reason="High priority",
            priority=10,
        ),
    ]

    matches = find_matching_rules(rules, "return", {})

    assert [rule.rule_id for rule in matches] == ["high", "low"]
