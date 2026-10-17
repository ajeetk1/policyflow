from app.services.policy_preprocessor import preprocess_policy


text = """
Rule 2.1: Refunds below ₹10,000 may be approved automatically.

Rule 2.2: Refunds from ₹10,000 through ₹50,000 require manager approval.

Rule 2.3: Refunds above ₹50,000 require approval from the Finance team.
"""


result = preprocess_policy(text)

print("Rule count:", result["rule_count"])

print("\nRules:")

for rule in result["rules"]:
    print(rule)