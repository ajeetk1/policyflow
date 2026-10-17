import re
from typing import List, Dict


def clean_policy_text(text: str) -> str:
    """
    Clean common PDF extraction artifacts.
    Does not interpret business rules.
    """

    # Fix common currency extraction artifact
    text = text.replace("■", "₹")

    # Normalize line endings
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Remove excessive spaces
    text = re.sub(r"[ \t]+", " ", text)

    # Remove excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def extract_rule_blocks(text: str) -> List[Dict[str, str]]:
    """
    Find explicit numbered rules in a policy document.
    """

    pattern = re.compile(
        r"Rule\s+(\d+(?:\.\d+)*)\s*:\s*"
        r"(.*?)(?=\n\s*Rule\s+\d+(?:\.\d+)*\s*:|\Z)",
        re.IGNORECASE | re.DOTALL,
    )

    matches = pattern.findall(text)

    rules = []

    for rule_id, rule_text in matches:

        rule_text = re.sub(
            r"\s+",
            " ",
            rule_text,
        ).strip()

        rules.append(
            {
                "rule_id": rule_id,
                "text": rule_text,
            }
        )

    return rules


def preprocess_policy(text: str) -> Dict:
    """
    Main policy preprocessing pipeline.
    """

    cleaned_text = clean_policy_text(text)

    rules = extract_rule_blocks(cleaned_text)

    return {
        "cleaned_text": cleaned_text,
        "rules": rules,
        "rule_count": len(rules),
    }