from app.decision.engine import decide
from app.models.gmail import EmailRequest
from app.policy.rules import PolicyCondition, PolicyRule


def make_rule(rule_id: str, decision: str, priority: int) -> PolicyRule:
    return PolicyRule(
        rule_id=rule_id,
        action="refund",
        conditions=[
            PolicyCondition(field="amount", operator=">=", value=0),
        ],
        decision=decision,
        reason=f"Applied {rule_id}.",
        priority=priority,
    )


def make_refund_request() -> EmailRequest:
    return EmailRequest(
        subject="Refund request",
        body="Please review this refund.",
        amount=100,
    )


def test_conflicting_equal_priority_rules_fail_closed() -> None:
    result = decide(
        make_refund_request(),
        [
            make_rule("rule_b", "MANAGER_APPROVAL", 10),
            make_rule("rule_a", "APPROVE", 10),
        ],
    )

    assert result.decision == "NEED_APPROVAL"
    assert result.request_approval is True
    assert result.rules_used == ["rule_a", "rule_b"]


def test_higher_priority_rule_wins() -> None:
    result = decide(
        make_refund_request(),
        [
            make_rule("lower_priority", "APPROVE", 1),
            make_rule("higher_priority", "MANAGER_APPROVAL", 20),
        ],
    )

    assert result.decision == "MANAGER_APPROVAL"
    assert result.rules_used == ["higher_priority"]


def test_no_matching_rule_requires_approval() -> None:
    rule = PolicyRule(
        rule_id="high_threshold",
        action="refund",
        conditions=[PolicyCondition(field="amount", operator=">", value=10000)],
        decision="APPROVE",
        reason="High threshold.",
        priority=10,
    )

    result = decide(make_refund_request(), [rule])

    assert result.decision == "NEED_APPROVAL"
    assert result.request_approval is True
    assert result.rules_used == []
