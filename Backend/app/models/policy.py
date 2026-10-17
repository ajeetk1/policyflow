from pydantic import BaseModel 

class PolicyRule(BaseModel):
    rule_id: str
    category: str
    condition: str
    action: str
    source: str 

class PolicyDocument(BaseModel):
    policy_id: str
    company_id: str
    filename: str 
    rules: list[PolicyRule]

    