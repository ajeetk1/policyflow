from app.decision.policy_decision import make_policy_decision
from app.models.gmail import DecisionResponse, EmailRequest
from app.policy.rules import PolicyRule


ENGINE_VERSION = "2.0"


def decide(
    email: EmailRequest,
    rules: list[PolicyRule] | None = None,
) -> DecisionResponse:
    text = f"{email.subject} {email.body}".lower()

    if "refund" in text:
        intent = "refund"
    elif "meeting" in text:
        return DecisionResponse(
            intent="meeting",
            risk="low",
            decision="reply",
            request_approval=False,
            reason="Meeting requests are handled as replies.",
            rules_used=[],
        )
    elif "unsubscribe" in text:
        return DecisionResponse(
            intent="unsubscribe",
            risk="low",
            decision="archive",
            request_approval=False,
            reason="Unsubscribe requests are archived.",
            rules_used=[],
        )
    else:
        return DecisionResponse(
            intent="unknown",
            risk="medium",
            decision="review",
            request_approval=True,
            reason="The request intent could not be determined safely.",
            rules_used=[],
        )

    facts = {
        "amount": email.amount,
        "days_since_purchase": email.days_since_purchase,
        "evidence_present": email.evidence_present,
        "fraud_indicator": email.fraud_indicator,
    }
    result = make_policy_decision("refund", facts, rules)
    return DecisionResponse(
        intent=intent,
        risk="normal" if result["rules_used"] else "unknown",
        decision=result["decision"],
        request_approval=result["request_approval"],
        reason=result["reason"],
        rules_used=result["rules_used"],
    )
