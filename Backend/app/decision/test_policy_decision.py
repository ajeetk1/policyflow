from app.decision.policy_decision import make_policy_decision
from app.policy.rules import PolicyCondition, PolicyRule


def make_rule(
    rule_id="refund_001",
    decision="APPROVE",
    priority=10,
    requires_review=False,
):
    return PolicyRule(
        rule_id=rule_id,
        action="refund",
        conditions=[
            PolicyCondition(
                field="amount",
                operator="<",
                value=10000,
            )
        ],
        decision=decision,
        reason=f"Test reason for {decision}.",
        priority=priority,
        requires_review=requires_review,
        review_notes=(
            ["Human review required."]
            if requires_review
            else []
        ),
    )


def test_matching_rule_approves_request():
    rule = make_rule()

    result = make_policy_decision(
        action="refund",
        facts={"amount": 5000},
        rules=[rule],
    )

    assert result["decision"] == "APPROVE"
    assert result["request_approval"] is False
    assert result["rules_used"] == ["refund_001"]


def test_no_matching_rule_requires_approval():
    result = make_policy_decision(
        action="refund",
        facts={"amount": 15000},
        rules=[make_rule()],
    )

    assert result["decision"] == "NEED_APPROVAL"
    assert result["request_approval"] is True
    assert result["rules_used"] == []


def test_equal_priority_conflicting_rules_require_approval():
    rules = [
        make_rule(
            rule_id="refund_approve",
            decision="APPROVE",
            priority=10,
        ),
        make_rule(
            rule_id="refund_reject",
            decision="REJECT",
            priority=10,
        ),
    ]

    result = make_policy_decision(
        action="refund",
        facts={"amount": 5000},
        rules=rules,
    )

    assert result["decision"] == "NEED_APPROVAL"
    assert result["request_approval"] is True
    assert set(result["rules_used"]) == {
        "refund_approve",
        "refund_reject",
    }


def test_review_required_rule_cannot_automatically_approve():
    rule = make_rule(requires_review=True)

    result = make_policy_decision(
        action="refund",
        facts={"amount": 5000},
        rules=[rule],
    )

    assert result["decision"] == "NEED_APPROVAL"
    assert result["request_approval"] is True
    assert result["rules_used"] == []
