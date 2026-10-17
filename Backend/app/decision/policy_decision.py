from app.policy.store import active_policy_rules
from app.policy.evaluator import find_matching_rules


def make_policy_decision(action: str, facts: dict, rules=None):
    matches = find_matching_rules(
        active_policy_rules if rules is None else rules,
        action,
        facts,
    )

    if not matches:
        return {
           "decision": "NEED_APPROVAL",
           "request_approval": True,
           "reason": "No matching policy rule was found.",
           "rules_used": [],
           "matches": [],
        }

    highest_priority = matches[0].priority
    top_matches = [rule for rule in matches if rule.priority == highest_priority]
    outcomes = {rule.decision for rule in top_matches}
    if len(outcomes) > 1:
        return {
           "decision": "NEED_APPROVAL",
           "request_approval": True,
           "reason": "Conflicting rules with equal priority require human review.",
           "rules_used": [rule.rule_id for rule in top_matches],
           "matches": matches,
        }

    selected_rule = top_matches[0]
    return {
        "decision": selected_rule.decision,
        "request_approval": selected_rule.decision.upper() != "APPROVE",
        "reason": selected_rule.reason,
        "rules_used": [rule.rule_id for rule in top_matches],
        "matches": matches,
    }