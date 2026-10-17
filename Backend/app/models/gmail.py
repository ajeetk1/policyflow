#Create Gmail Request Model 

from pydantic import BaseModel, Field


class EmailRequest(BaseModel):
    subject: str
    body: str
    amount: float | None = None
    days_since_purchase: int | None = None
    evidence_present: bool = True
    fraud_indicator: bool = False


class DecisionResponse(BaseModel):
    intent: str
    risk: str
    decision: str
    request_approval: bool
    reason: str = ""
    rules_used: list[str] = Field(default_factory=list)
    request_id: str | None = None
    policy_version_id: int | None = None
