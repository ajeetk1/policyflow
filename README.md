# Policy Flow

A policy-driven API that converts business requests into structured, explainable decisions and approval requirements.

Decision API is designed to sit between an AI agent and business execution systems. Instead of allowing an agent to directly execute sensitive actions, the agent sends the request to the Decision API, which validates the input, evaluates company policies, and returns the appropriate decision.

---

## Problem

AI agents can read emails and understand what a customer is asking, but understanding an email is different from deciding what the business is allowed to do.

For example:

> "The customer wants a ₹35,000 refund for a damaged product."

An agent may understand the request, but the company policy may require manager approval.

The Decision API acts as the policy and decision layer between the agent and the execution system.

```text
Gmail Agent
     │
     │ Customer request + context
     ▼
Decision API
     │
     ├── Input Validation
     ├── Decision Engine
     └── Policy Engine
     │
     ▼
Decision
     │
     ▼
Gmail / Business System
```

---

## Current Architecture

```text
                    Gmail / Email
                         │
                         ▼
                    Gmail Agent
                 Read & Understand
                         │
                         │ Structured request
                         ▼
                  ┌───────────────┐
                  │ Decision API  │
                  │    FastAPI    │
                  └───────┬───────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
         Pydantic     Decision      Policy
         Validation     Engine       Engine
                          │            │
                          └─────┬──────┘
                                ▼
                       Structured Decision
                                │
                                ▼
                         Gmail / Execution
```

---

## How It Works

### 1. Agent Layer

The Gmail Agent reads an incoming email and extracts the relevant information.

Example:

```json
{
  "subject": "Refund request",
  "body": "Customer wants a refund",
  "amount": 35000,
  "days_since_purchase": 20,
  "evidence_present": true,
  "fraud_indicator": false
}
```

### 2. Decision API

The request is sent to the Decision API.

The API:

* validates the request
* identifies the intent
* evaluates the relevant policy
* determines the required approval
* returns a structured decision

### 3. Execution Layer

The agent or connected business system can use the decision to determine the next action.

For example:

```text
APPROVE
       → Execute automatically

MANAGER_APPROVAL
       → Request manager approval

FINANCE_APPROVAL
       → Request Finance approval

FRAUD_REVIEW
       → Escalate to Fraud/Risk team
```

The Decision API does not blindly execute sensitive business actions. It determines what action is permitted or required.

---

# Example

### Request

```http
POST /v1/gmail/decide
```

```json
{
  "subject": "Refund request",
  "body": "Customer wants a refund",
  "amount": 35000,
  "days_since_purchase": 20,
  "evidence_present": true,
  "fraud_indicator": false
}
```

### Response

```json
{
  "intent": "refund",
  "risk": "normal",
  "decision": "MANAGER_APPROVAL",
  "request_approval": true
}
```

The decision comes from the configured company policy.

For example:

```text
₹10,000 - ₹50,000
        ↓
Manager approval required
```

---

# Policy Engine

The API can ingest company policy documents and convert relevant policy rules into structured rules.

Example policy:

> Refunds from ₹10,000 through ₹50,000 require manager approval.

Structured rule:

```json
{
  "rule_id": "refund_002",
  "action": "refund",
  "min_amount": 10000,
  "max_amount": 50000,
  "decision": "MANAGER_APPROVAL"
}
```

The policy engine then evaluates incoming requests against these rules.

---

# Policy PDF Upload

The API accepts and stores a company policy PDF, then processes it in a background task. Upload requests return a job ID as soon as the file is safely stored.

```http
POST /v1/policies/upload
```

Use the returned job ID to check processing status or retry a failed extraction:

```http
GET  /v1/policies/uploads/{job_id}
POST /v1/policies/uploads/{job_id}/retry
```

The upload response includes `job_id`, `filename`, and `status`. Status is `queued`, `processing`, `completed`, or `failed`; completed jobs include extracted rules, and failed jobs include an error message.

Uploaded PDFs and job status are stored under `app/data/policy_uploads` by default. Set `POLICY_UPLOAD_DIR` to use another persistent directory.

The policy pipeline runs after the upload request returns:

```text
Company Policy PDF
        ↓
Safely Stored + Job ID Returned
        ↓
PDF Text Extraction
        ↓
Policy Parser + LLM Extraction
        ↓
Structured Policy Rules
        ↓
Database + Policy Store
        ↓
Decision Engine
```

The API can currently extract policy text and identify supported policy rules such as refund thresholds, approval requirements, time-based rules, and fraud-related rules.

---

# API Endpoints

| Method | Endpoint              | Purpose                               |
| ------ | --------------------- | ------------------------------------- |
| GET    | `/health`             | Health check                          |
| POST   | `/v1/gmail/decide`    | Evaluate an email/request             |
| POST   | `/v1/policies/upload` | Store a PDF and start background processing |
| GET    | `/v1/policies/uploads/{job_id}` | Read upload and processing status |
| POST   | `/v1/policies/uploads/{job_id}/retry` | Retry failed policy processing |
| GET    | `/v1/policies/groups` | List the signed-in user's policy groups |
| GET    | `/v1/policies/groups/{policy_group_id}/versions` | List policy versions and validation results |
| POST   | `/v1/policies/groups/{policy_group_id}/versions/{version_id}/activate` | Validate and activate a draft |
| POST   | `/v1/policies/groups/{policy_group_id}/versions/{version_id}/rollback` | Restore an older validated version |
| POST   | `/v1/gmail/decide` | Evaluate and durably audit a decision for the signed-in user |
| GET    | `/v1/decisions` | Query the signed-in user's decision audit ledger |
| GET    | `/docs`               | Interactive Swagger API documentation          |

All policy, decision, and audit routes require a valid Clerk bearer session token. Data is isolated to a private workspace derived from the verified Clerk user ID; Clerk organizations and organization roles are not required. Uploaded policies remain drafts until explicitly activated; a processing completion is not an activation.

---

# Running Locally

## 1. Clone the repository

```bash
git clone https://github.com/AjeetK-AI/Decision-API.git
cd Decision-API
```

## 2. Create a virtual environment

```bash
python3 -m venv .venv
```

Activate it:

### macOS / Linux

```bash
source .venv/bin/activate
```

### Windows

```bash
.venv\Scripts\activate
```

## 3. Install dependencies

```bash
pip install -r requirements.txt
```

## 4. Configure authentication and database migrations

Policy and decision endpoints require a signed-in Clerk session. Configure the frontend publishable key in `Frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Configure the API in the repository-root `.env` alongside `DATABASE_URL`:

```dotenv
CLERK_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json
CLERK_ISSUER=https://<your-clerk-domain>
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Use the exact JWKS URL and issuer shown for your Clerk application. `CLERK_AUDIENCE` is optional. Do not commit real keys or database credentials. Clerk organizations and organization-role configuration are not used.

Before starting the updated API, review the configured `DATABASE_URL` and take a database backup, then run the additive schema migration from the backend directory:

```bash
cd "Backend "
python -m alembic upgrade head
```

The migration adds the tables used for account workspaces, policy groups and versions, activation events, and decision audit records. Existing policy rows are preserved and backfilled as non-active legacy drafts. The current schema keeps a legacy tenant table internally, but each signed-in Clerk user receives a private workspace; Clerk organization claims are not required. Do not run the migration against a production database until its target and backup have been verified.

## 5. Start the API

```bash
uvicorn app.main:app --reload
```

The API will be available at:

```text
http://127.0.0.1:8000
```

Swagger documentation:

```text
http://127.0.0.1:8000/docs
```

---

# Project Structure

```text
Decision-API/
│
├── app/
│   ├── api/
│   ├── data/
│   ├── database/
│   ├── decision/
│   ├── llm/
│   ├── models/
│   ├── policy/
│   ├── services/
│   └── main.py
│
├── tests/
│
├── .gitignore
├── README.md
└── requirements.txt
```

---

# Design Philosophy

The Decision API separates three responsibilities:

```text
AGENT
Understand the request
        ↓
DECISION API
Determine what should happen
        ↓
EXECUTION
Perform the approved action
```

This separation allows AI agents to understand unstructured information while keeping business decisions governed by explicit company policies.

---

# Roadmap

### Current

* FastAPI API
* Pydantic request validation
* Email decision endpoint
* Policy PDF upload
* PDF text extraction
* Policy rule parsing
* Deterministic policy evaluation
* Approval decisions
* Fraud-related escalation rules

### Next

* Generic policy condition evaluator
* Request-aware policy retrieval
* Support for return, cancellation, warranty, and other business policies
* Structured fact extraction from emails
* LLM-assisted policy interpretation
* Policy versioning
* Decision audit logs
* Explainable decisions with rules used
* Authentication/API keys
* Production deployment

### Long-term Architecture

```text
                    Customer Email
                          │
                          ▼
                     AI Agent
                          │
                          ▼
                 Structured Facts
                          │
                          ▼
              ┌─────────────────────┐
              │    Decision API     │
              │                     │
              │ Policy Retrieval    │
              │ Policy Evaluation   │
              │ Decision Engine     │
              └──────────┬──────────┘
                         │
                         ▼
                Explainable Decision
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           Approve     Approval    Escalate
              │          │          │
              └──────────┴──────────┘
                         ▼
                     Execution
```

---

# Project Status

**Early-stage prototype / V1**

The current implementation focuses on Gmail/email decision workflows and policy-driven refund decisions. The architecture is being expanded toward a general-purpose policy-driven Decision API for AI agents.

---

# License

License information will be added as the project moves toward public release.
