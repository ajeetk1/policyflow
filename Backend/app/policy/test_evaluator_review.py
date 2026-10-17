from app.policy.evaluator import evaluate_rule, find_matching_rules
from app.policy.rules import PolicyCondition, PolicyRule


def test_rule_requiring_review_never_matches():
    rule = PolicyRule(
        rule_id="refund_review_001",
        action="refund",
        conditions=[
            PolicyCondition(
                field="amount",
                operator="<",
                value=10000,
            )
        ],
        decision="APPROVE",
        reason="Needs human review.",
        priority=10,
        requires_review=True,
        review_notes=["Confirm the exception with a manager."],
    )

    facts = {"amount": 100}

    assert evaluate_rule(rule, facts) is False
    assert find_matching_rules([rule], "refund", facts) == []


def test_supported_rule_matches_normally():
    rule = PolicyRule(
        rule_id="refund_001",
        action="refund",
        conditions=[
            PolicyCondition(
                field="amount",
                operator="<",
                value=10000,
            )
        ],
        decision="APPROVE",
        reason="Within the refund limit.",
        priority=10,
    )

    assert evaluate_rule(rule, {"amount": 100}) is True
    assert find_matching_rules([rule], "refund", {"amount": 100}) == [rule]
