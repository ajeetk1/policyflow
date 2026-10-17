import json
from types import SimpleNamespace

from app.services import llm_policy_parser


def test_extracts_rule_and_normalizes_operator(monkeypatch):
    response_data = {
        "rule_id": "ignored-model-id",
        "action": " Refund ",
        "conditions": [
            {
                "field": "amount",
                "operator": "less than or equal to",
                "value": 10000,
            }
        ],
        "decision": "APPROVE",
        "reason": "Within the refund limit.",
        "priority": 10,
    }

    def fake_create(**kwargs):
        assert kwargs["temperature"] == 0
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps(response_data)
                    )
                )
            ]
        )

    monkeypatch.setattr(
        llm_policy_parser.client.chat.completions,
        "create",
        fake_create,
    )

    rules = llm_policy_parser.extract_policy_rules_with_llm(
        [
            {
                "rule_id": "2.1",
                "text": "Refunds up to 10000 may be approved.",
            }
        ]
    )

    assert len(rules) == 1
    assert rules[0].rule_id == "2.1"
    assert rules[0].action == "refund"
    assert rules[0].conditions[0].operator == "<="
    assert rules[0].conditions[0].value == 10000
    assert rules[0].source == "Refunds up to 10000 may be approved."


def test_empty_rule_list_does_not_call_llm(monkeypatch):
    def unexpected_call(**kwargs):
        raise AssertionError("LLM should not be called for empty input")

    monkeypatch.setattr(
        llm_policy_parser.client.chat.completions,
        "create",
        unexpected_call,
    )

    assert llm_policy_parser.extract_policy_rules_with_llm([]) == []
