#Let make Rules that define refunds,return, cancellation,warranty etc.

from typing import Any
from pydantic import BaseModel, Field


class PolicyCondition(BaseModel):
    field: str
    operator: str
    value: Any


class PolicyRule(BaseModel):
    rule_id: str
    action: str
    conditions: list[PolicyCondition] = Field(default_factory=list)
    decision: str
    reason: str
    priority: int = 0
    source: str = ""

    # Rules with unsupported or incompletely represented requirements
    # must be reviewed before they can be activated.
    requires_review: bool = False
    review_notes: list[str] = Field(default_factory=list)
