
import json
import logging
import time

from groq import RateLimitError

from app.llm.client import client
from app.llm.prompts import POLICY_EXTRACTION_PROMPT
from app.policy.rules import PolicyRule


MODEL = "openai/gpt-oss-120b"
MAX_ATTEMPTS = 6


def _normalize_operator(operator: str) -> str:
    """Convert common operator names into canonical symbols."""
    normalized = "_".join(
        operator.strip().lower().replace("-", " ").split()
    )
    aliases = {
        "eq": "==",
        "equal": "==",
        "equals": "==",
        "equal_to": "==",
        "is_equal_to": "==",
        "ne": "!=",
        "neq": "!=",
        "not_equal": "!=",
        "not_equals": "!=",
        "not_equal_to": "!=",
        "gte": ">=",
        "ge": ">=",
        "gteq": ">=",
        "greater_or_equal": ">=",
        "greater_than_or_equal": ">=",
        "greater_than_or_equal_to": ">=",
        "lte": "<=",
        "le": "<=",
        "lteq": "<=",
        "less_or_equal": "<=",
        "less_than_or_equal": "<=",
        "less_than_or_equal_to": "<=",
        "gt": ">",
        "greater_than": ">",
        "lt": "<",
        "less_than": "<",
    }
    return aliases.get(normalized, operator.strip())


def _extract_rule_with_llm(rule: dict[str, str]) -> PolicyRule:
    rule_id = rule["rule_id"]
    rule_text = rule["text"]

    prompt = POLICY_EXTRACTION_PROMPT.format(
        rule_id=rule_id,
        rule_text=rule_text,
    )

    messages = [
        {
            "role": "system",
            "content": (
                "You are a policy extraction system. "
                "Convert the supplied policy rule into "
                "structured JSON. Return JSON only."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    for attempt in range(MAX_ATTEMPTS):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                temperature=0,
                response_format={"type": "json_object"},
                messages=messages,
            )

            content = response.choices[0].message.content
            if not content:
                raise ValueError(
                    f"LLM returned an empty response for rule {rule_id}"
                )

            data = json.loads(content)
            rule_data = data.get("rule", data)

            # Normalize action formatting only. Do not infer or replace
            # the action's meaning; the prompt defines its semantics.
            action = rule_data.get("action")
            if isinstance(action, str):
                rule_data["action"] = (
                    action.strip().lower().replace(" ", "_").replace("-", "_")
                )


            # Normalize operator aliases before model validation.
            for condition in rule_data.get("conditions", []):
                operator = condition.get("operator")
                if isinstance(operator, str):
                    condition["operator"] = _normalize_operator(operator)

            # Keep the original source text for traceability.
            rule_data["rule_id"] = rule_id
            return PolicyRule(**rule_data, source=rule_text)

        except RateLimitError:
            if attempt == MAX_ATTEMPTS - 1:
                logging.exception(
                    "Groq rate limit retries exhausted for rule %s",
                    rule_id,
                )
                raise

            delay = min(5 * (2**attempt), 60)
            logging.warning(
                "Groq rate limit for rule %s; retrying in %s seconds "
                "(attempt %s/%s)",
                rule_id,
                delay,
                attempt + 1,
                MAX_ATTEMPTS,
            )
            time.sleep(delay)

    raise RuntimeError(f"Could not extract policy rule {rule_id}")


def extract_policy_rules_with_llm(
    rule_blocks: list[dict[str, str]],
) -> list[PolicyRule]:
    if not rule_blocks:
        return []

    # Sequential calls reduce TPM spikes on Groq's on-demand tier.
    # Failed rate-limited requests are retried by the function above.
    rules: list[PolicyRule] = []

    for index, rule_block in enumerate(rule_blocks, start=1):
        logging.info(
            "Extracting policy rule %s/%s: %s",
            index,
            len(rule_blocks),
            rule_block["rule_id"],
        )
        rules.append(_extract_rule_with_llm(rule_block))

    return rules
