from app.policy.rules import POLICY_RULES
from app.policy.store import active_policy_rules


def check_policy(
    action,
    amount,
    days_since_purchase=None,
    evidence_present=True,
    fraud_indicator=False
):
    matching_rules = []

    for rule in active_policy_rules:

        # 1. Check action
        if rule.action != action:
            continue

        # 2. Check minimum amount
        if rule.min_amount is not None:
            if amount < rule.min_amount:
                continue

        # 3. Check maximum amount
        if rule.max_amount is not None:
            if amount > rule.max_amount:
                continue

        # 4. Check conditions
        conditions_met = True

        for condition in rule.conditions:

            if condition == "days_since_purchase > 30":

                if days_since_purchase is None:
                    conditions_met = False
                    break

                if days_since_purchase <= 30:
                    conditions_met = False
                    break

            elif condition == "fraud_indicator == true":

                if fraud_indicator is not True:
                    conditions_met = False
                    break

        if conditions_met:
            matching_rules.append(rule)

    # 5. No matching rule
    if not matching_rules:
        return None

    # 6. Highest priority rule wins
    matching_rules.sort(
        key=lambda rule: rule.priority,
        reverse=True
    )

    return matching_rules[0]