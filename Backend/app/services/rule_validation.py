
import math
import re

from app.policy.rules import PolicyRule


SUPPORTED_FIELDS = {
    "amount": (int, float),
    "days_since_purchase": (int, float),
    "evidence_present": (bool,),
    "fraud_indicator": (bool,),
}
SUPPORTED_OPERATORS = {"==", "!=", ">", ">=", "<", "<="}
RULE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$")
ACTION_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")


def validate_extracted_rules(
    expected_rule_ids: list[str],
    rules: list[PolicyRule],
) -> None:
    if len(expected_rule_ids) != len(set(expected_rule_ids)):
        raise ValueError("The source policy contains duplicate rule IDs.")

    actual_ids = [rule.rule_id for rule in rules]
    if len(actual_ids) != len(set(actual_ids)):
        raise ValueError("Rule extraction returned duplicate rule IDs.")

    expected = set(expected_rule_ids)
    actual = set(actual_ids)

    if expected != actual:
        raise ValueError(
            "Policy extraction was incomplete. "
            f"Missing rules: {sorted(expected - actual)}; "
            f"unexpected rules: {sorted(actual - expected)}."
        )

    for rule in rules:
        if not RULE_ID_PATTERN.fullmatch(rule.rule_id):
            raise ValueError(f"Rule {rule.rule_id!r} has an invalid rule ID.")

        if not ACTION_PATTERN.fullmatch(rule.action):
            raise ValueError(f"Rule {rule.rule_id} has an invalid action.")

        if not rule.decision.strip() or len(rule.decision) > 255:
            raise ValueError(f"Rule {rule.rule_id} has an invalid decision.")

        if not isinstance(rule.priority, int) or rule.priority < 0:
            raise ValueError(f"Rule {rule.rule_id} has an invalid priority.")

        if rule.requires_review:
            notes = [
                note.strip()
                for note in rule.review_notes
                if isinstance(note, str) and note.strip()
            ]
            if not notes:
                raise ValueError(
                    f"Rule {rule.rule_id} requires review but has no review notes."
                )

        if not rule.conditions and not rule.requires_review:
            raise ValueError(
                f"Rule {rule.rule_id} has no explicit conditions "
                "and is not marked for review."
            )

        for condition in rule.conditions:
            if condition.operator not in SUPPORTED_OPERATORS:
                raise ValueError(
                    f"Rule {rule.rule_id} uses unsupported operator "
                    f"{condition.operator!r}."
                )

            expected_types = SUPPORTED_FIELDS.get(condition.field)

            if expected_types is None:
                if rule.requires_review:
                    # Preserve the original condition for human review.
                    # The evaluator must not execute review-required rules.
                    continue

                raise ValueError(
                    f"Rule {rule.rule_id} uses unsupported field "
                    f"{condition.field!r}."
                )

            if (
                condition.operator not in {"==", "!="}
                and condition.field in {"evidence_present", "fraud_indicator"}
            ):
                raise ValueError(
                    f"Rule {rule.rule_id} uses an ordering operator "
                    "on a boolean field."
                )

            if condition.field in {"amount", "days_since_purchase"}:
                if isinstance(condition.value, bool) or not isinstance(
                    condition.value, expected_types
                ):
                    raise ValueError(
                        f"Rule {rule.rule_id} has a non-numeric threshold "
                        f"for {condition.field}."
                    )

                if not math.isfinite(condition.value):
                    raise ValueError(
                        f"Rule {rule.rule_id} has a non-finite threshold."
                    )

                if condition.value < 0:
                    raise ValueError(
                        f"Rule {rule.rule_id} has a negative threshold "
                        f"for {condition.field}."
                    )

            elif type(condition.value) not in expected_types:
                raise ValueError(
                    f"Rule {rule.rule_id} has an invalid value "
                    f"for {condition.field}."
                )
