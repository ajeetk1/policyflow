from app.policy.parser import extract_policy_rules


text = """
Refunds below ₹10,000 may be approved automatically.

Refunds from ₹10,000 through ₹50,000 require manager approval.

Refunds above ₹50,000 require approval from the Finance team.
"""


rules = extract_policy_rules(text)


for rule in rules:
    print(rule)