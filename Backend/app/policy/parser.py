import re


def extract_policy_rules(
    policy_text: str,
) -> list[dict[str, str]]:
    """
    Split policy text into individual policy rules.

    This parser only identifies rule boundaries.
    It does not interpret the business meaning.
    """

    rule_blocks: list[dict[str, str]] = []

    pattern = re.compile(
        r"Rule\s+(\d+(?:\.\d+)*)\s*:\s*"
        r"(.*?)(?=\s*Rule\s+\d+(?:\.\d+)*\s*:|\Z)",
        re.IGNORECASE | re.DOTALL,
    )

    matches = pattern.findall(policy_text)

    print("DEBUG MATCHES:", matches)

    for rule_id, rule_text in matches:
        rule_blocks.append(
            {
                "rule_id": rule_id,
                "text": " ".join(rule_text.split()),
            }
        )

    return rule_blocks
