def evaluate_condition(condition, facts):
    field_value = facts.get(condition.field)
    if field_value is None:
        return False

    if condition.field in {"amount", "days_since_purchase"}:
        if (
            isinstance(field_value, bool)
            or not isinstance(field_value, (int, float))
            or isinstance(condition.value, bool)
            or not isinstance(condition.value, (int, float))
        ):
            return False
    elif condition.field in {"evidence_present", "fraud_indicator"}:
        if type(field_value) is not bool or type(condition.value) is not bool:
            return False
    elif type(field_value) is not type(condition.value):
        return False

    if condition.operator == "==":
        return field_value == condition.value

    if condition.operator == "!=":
        return field_value != condition.value

    if condition.operator == ">":
        return field_value > condition.value

    if condition.operator == ">=":
        return field_value >= condition.value

    if condition.operator == "<":
        return field_value < condition.value

    if condition.operator == "<=":
        return field_value <= condition.value

    return False


def evaluate_rule(rule, facts):
    if getattr(rule, "requires_review", False):
        return False

    for condition in rule.conditions:
        if not evaluate_condition(condition, facts):
            return False
    return True


def find_matching_rules(rules, action, facts):
    matches = []
    for rule in rules:
        if rule.action != action:
            continue
        if evaluate_rule(rule, facts):
            matches.append(rule)

    matches.sort(key=lambda rule: (-rule.priority, rule.rule_id))
    return matches
 