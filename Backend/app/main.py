# FastAPI
import json
import logging
import os
from pathlib import Path
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import UserContext, auth_router, get_current_user
from app.database.database import SessionLocal
from app.database.models import (
    DecisionLogRecord,
    PolicyActivationEventRecord,
    PolicyGroupRecord,
    PolicyRecord,
    PolicyRuleRecord,
)
from app.models.gmail import EmailRequest, DecisionResponse
from app.decision.engine import decide
from app.policy.evaluator import find_matching_rules
from app.policy.rules import PolicyRule
from app.services.llm_policy_parser import extract_policy_rules_with_llm
from app.services.policy_preprocessor import preprocess_policy
from app.services.rule_validation import validate_extracted_rules

from pypdf import PdfReader


app = FastAPI(
    title="Policy Flow",
    version="1.01.2"
)

app.include_router(
    auth_router,
    prefix="/auth",
    tags=["Authentication"],
)

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

POLICY_UPLOAD_DIR = Path(
    os.getenv(
        "POLICY_UPLOAD_DIR",
        str(Path(__file__).parent / "data" / "policy_uploads"),
    )
)


def _upload_file_path(job_id: UUID) -> Path:
    return POLICY_UPLOAD_DIR / f"{job_id.hex}.pdf"


def _upload_job_path(job_id: UUID) -> Path:
    return POLICY_UPLOAD_DIR / f"{job_id.hex}.json"


def _read_upload_job(job_id: UUID) -> dict:
    try:
        with _upload_job_path(job_id).open(encoding="utf-8") as job_file:
            return json.load(job_file)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Policy upload job not found.") from exc


def _write_upload_job(job_id: UUID, job: dict) -> None:
    POLICY_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    temporary_path = _upload_job_path(job_id).with_suffix(".tmp")
    with temporary_path.open("w", encoding="utf-8") as job_file:
        json.dump(job, job_file)
    os.replace(temporary_path, _upload_job_path(job_id))


def _process_policy_upload(job_id: UUID) -> None:
    job = _read_upload_job(job_id)
    job["status"] = "processing"
    job.pop("error", None)
    _write_upload_job(job_id, job)

    try:
        db = SessionLocal()
        try:
            policy = db.get(PolicyRecord, job["policy_id"])
            if policy is None:
                raise ValueError("The policy version for this upload no longer exists.")
            policy.status = "processing"
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        reader = PdfReader(str(_upload_file_path(job_id)))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        rule_blocks = preprocess_policy(text)["rules"]
        if not rule_blocks:
            raise ValueError("No numbered policy rules were found in the uploaded PDF.")
        rules = extract_policy_rules_with_llm(rule_blocks)
        validate_extracted_rules(
            [rule["rule_id"] for rule in rule_blocks],
            rules,
        )

        db = SessionLocal()
        try:
            policy_record = (
                db.query(PolicyRecord)
                .filter(
                    PolicyRecord.id == job["policy_id"],
                    PolicyRecord.policy_group_id == job["policy_group_id"],
                )
                .one_or_none()
            )
            if policy_record is None:
                raise ValueError("The policy version for this upload no longer exists.")
            if policy_record.status == "archived":
                raise ValueError("Archived policy versions cannot be processed.")

            policy_record.rules.clear()
            for rule in rules:
                conditions = [condition.model_dump() for condition in rule.conditions]
                db.add(
                    PolicyRuleRecord(
                        policy_id=policy_record.id,
                        rule_id=rule.rule_id,
                        action=rule.action,
                        conditions=conditions,
                        decision=rule.decision,
                        reason=rule.reason,
                        priority=rule.priority,
                        source=rule.source or "",

                        requires_review=rule.requires_review,
                        review_notes=rule.review_notes,
                    )
                )
            policy_record.pages = len(reader.pages)
            policy_record.characters = len(text)
            policy_record.status = "draft"
            db.commit()
        except Exception:
            db.rollback()
            logging.exception("Policy database save failed for upload %s", job_id)
            raise
        finally:
            db.close()

        job.update(
            {
                "status": "completed",
                "policy_status": "draft",
                "pages": len(reader.pages),
                "characters": len(text),
                "rule_count": len(rules),
                "rules": [rule.model_dump() for rule in rules],
            }
        )
        _write_upload_job(job_id, job)
    except Exception as exc:
        logging.exception("Policy processing failed for upload %s", job_id)
        job["status"] = "failed"
        job["error"] = str(exc) or "Policy processing failed."
        job["policy_status"] = "failed"
        db = SessionLocal()
        try:
            policy = db.get(PolicyRecord, job["policy_id"])
            if policy is not None and not policy.is_active:
                policy.status = "failed"
                db.commit()
        except Exception:
            db.rollback()
            logging.exception("Could not mark policy version failed for upload %s", job_id)
        finally:
            db.close()
        _write_upload_job(job_id, job)


@app.get("/health")
def health():
    return {
        "status": "Ok"
    }


def _policy_response(policy: PolicyRecord) -> dict:
    return {
        "policy_id": policy.id,
        "policy_group_id": policy.policy_group_id,
        "group_name": policy.policy_group.name,
        "version_number": policy.version_number,
        "filename": policy.filename,
        "pages": policy.pages,
        "characters": policy.characters,
        "status": policy.status,
        "is_active": policy.is_active,
        "created_at": policy.created_at.isoformat(),
        "activated_at": policy.activated_at.isoformat() if policy.activated_at else None,
        "rules": [
            {
                "rule_id": rule.rule_id,
                "action": rule.action,
                "conditions": rule.conditions,
                "decision": rule.decision,
                "reason": rule.reason,
                "priority": rule.priority,
                "source": rule.source,

                "requires_review": rule.requires_review,
                "review_notes": rule.review_notes,
            }
            for rule in policy.rules
        ],
    }


def _get_user_upload_job(job_id: UUID, workspace_id: str) -> dict:
    job = _read_upload_job(job_id)
    if job.get("workspace_id") != workspace_id:
        raise HTTPException(status_code=404, detail="Policy upload job not found.")
    return job


def _public_upload_job(job: dict) -> dict:
    return {key: value for key, value in job.items() if key != "workspace_id"}


@app.post("/v1/policies/upload", status_code=202)
async def upload_policy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    policy_group_id: UUID | None = Form(default=None),
    policy_name: str | None = Form(default=None, max_length=255),
    context: UserContext = Depends(get_current_user),
):
    if file.content_type != "application/pdf" and not (
        file.filename and file.filename.lower().endswith(".pdf")
    ):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    filename = Path(file.filename or "uploaded_policy.pdf").name
    POLICY_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    job_id = uuid4()
    file_path = _upload_file_path(job_id)
    byte_count = 0
    try:
        with file_path.open("wb") as stored_file:
            while chunk := await file.read(1024 * 1024):
                byte_count += len(chunk)
                if byte_count > 25 * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="PDF uploads are limited to 25 MB.")
                stored_file.write(chunk)
    except Exception:
        file_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    db: Session = SessionLocal()
    policy: PolicyRecord | None = None
    try:
        if policy_group_id is None:
            group_name = (policy_name or Path(filename).stem).strip()
            if not group_name:
                raise HTTPException(status_code=400, detail="A policy name is required.")
            group = (
                db.query(PolicyGroupRecord)
                .filter(
                    PolicyGroupRecord.organization_id == context.workspace_id,
                    PolicyGroupRecord.name == group_name[:255],
                )
                .order_by(PolicyGroupRecord.created_at.desc())
                .with_for_update()
                .first()
            )
            if group is None:
                group = PolicyGroupRecord(
                    id=str(uuid4()),
                    organization_id=context.workspace_id,
                    name=group_name[:255],
                )
                db.add(group)
                db.flush()
        else:
            group = (
                db.query(PolicyGroupRecord)
                .filter(
                    PolicyGroupRecord.id == str(policy_group_id),
                    PolicyGroupRecord.organization_id == context.workspace_id,
                )
                .with_for_update()
                .one_or_none()
            )
            if group is None:
                raise HTTPException(status_code=404, detail="Policy group not found.")

        current_version = (
            db.query(func.max(PolicyRecord.version_number))
            .filter(PolicyRecord.policy_group_id == group.id)
            .scalar()
            or 0
        )
        policy = PolicyRecord(
            policy_group_id=group.id,
            version_number=current_version + 1,
            filename=filename[:255],
            pages=0,
            characters=0,
            status="processing",
            is_active=False,
            created_by_user_id=context.user_id,
        )
        db.add(policy)
        db.flush()

        job = {
            "job_id": str(job_id),
            "filename": filename,
            "workspace_id": context.workspace_id,
            "policy_group_id": group.id,
            "policy_id": policy.id,
            "version_number": policy.version_number,
            "status": "queued",
            "policy_status": "processing",
        }
        _write_upload_job(job_id, job)
        db.commit()
    except HTTPException:
        db.rollback()
        file_path.unlink(missing_ok=True)
        _upload_job_path(job_id).unlink(missing_ok=True)
        raise
    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        _upload_job_path(job_id).unlink(missing_ok=True)
        logging.exception("Could not create policy upload job")
        raise HTTPException(status_code=500, detail="Could not save the uploaded policy.")
    finally:
        db.close()

    background_tasks.add_task(_process_policy_upload, job_id)
    return _public_upload_job(job)


@app.get("/v1/policies/uploads/{job_id}")
def get_policy_upload(
    job_id: UUID,
    context: UserContext = Depends(get_current_user),
):
    return _public_upload_job(_get_user_upload_job(job_id, context.workspace_id))


@app.post("/v1/policies/uploads/{job_id}/retry", status_code=202)
def retry_policy_upload(
    job_id: UUID,
    background_tasks: BackgroundTasks,
    context: UserContext = Depends(get_current_user),
):
    job = _get_user_upload_job(job_id, context.workspace_id)
    if job.get("status") != "failed":
        raise HTTPException(status_code=409, detail="Only failed policy uploads can be retried.")
    if not _upload_file_path(job_id).is_file():
        raise HTTPException(
            status_code=404,
            detail="The stored PDF for this upload is no longer available.",
        )

    db = SessionLocal()
    try:
        policy = (
            db.query(PolicyRecord)
            .filter(
                PolicyRecord.id == job["policy_id"],
                PolicyRecord.policy_group_id == job["policy_group_id"],
                PolicyGroupRecord.organization_id == context.workspace_id,
            )
            .join(PolicyGroupRecord)
            .with_for_update()
            .one_or_none()
        )
        if policy is None or policy.is_active:
            raise HTTPException(status_code=404, detail="Retryable policy version not found.")
        policy.status = "processing"
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logging.exception("Could not restart policy processing for upload %s", job_id)
        raise HTTPException(status_code=500, detail="Could not retry policy processing.")
    finally:
        db.close()

    job["status"] = "queued"
    job["policy_status"] = "processing"
    job.pop("error", None)
    job.pop("rules", None)
    job.pop("rule_count", None)
    job.pop("pages", None)
    job.pop("characters", None)
    _write_upload_job(job_id, job)
    background_tasks.add_task(_process_policy_upload, job_id)
    return _public_upload_job(job)


@app.get("/v1/policies/groups")
def list_policy_groups(
    context: UserContext = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        groups = (
            db.query(PolicyGroupRecord)
            .filter(PolicyGroupRecord.organization_id == context.workspace_id)
            .order_by(PolicyGroupRecord.created_at.desc())
            .all()
        )
        return [
            {
                "policy_group_id": group.id,
                "name": group.name,
                "versions": len(group.versions),
                "active_version": next(
                    (version.version_number for version in group.versions if version.is_active),
                    None,
                ),
            }
            for group in groups
        ]
    finally:
        db.close()


@app.get("/v1/policies/groups/{policy_group_id}/versions")
def list_policy_versions(
    policy_group_id: UUID,
    context: UserContext = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        group = (
            db.query(PolicyGroupRecord)
            .filter(
                PolicyGroupRecord.id == str(policy_group_id),
                PolicyGroupRecord.organization_id == context.workspace_id,
            )
            .one_or_none()
        )
        if group is None:
            raise HTTPException(status_code=404, detail="Policy group not found.")
        return [_policy_response(version) for version in sorted(
            group.versions,
            key=lambda version: version.version_number,
            reverse=True,
        )]
    finally:
        db.close()


def _activate_policy_version(
    db: Session,
    policy_group_id: UUID,
    version_id: int,
    context: UserContext,
    action: str,
) -> dict:
    group = (
        db.query(PolicyGroupRecord)
        .filter(
            PolicyGroupRecord.id == str(policy_group_id),
            PolicyGroupRecord.organization_id == context.workspace_id,
        )
        .with_for_update()
        .one_or_none()
    )
    if group is None:
        raise HTTPException(status_code=404, detail="Policy group not found.")

    target = (
        db.query(PolicyRecord)
        .filter(
            PolicyRecord.id == version_id,
            PolicyRecord.policy_group_id == group.id,
        )
        .with_for_update()
        .one_or_none()
    )
    if target is None:
        raise HTTPException(status_code=404, detail="Policy version not found.")
    if target.status not in {"draft", "active", "superseded"}:
        raise HTTPException(
            status_code=409,
            detail="Only successfully processed policy versions can be activated.",
        )

    
    rule_records = list(target.rules)

    rules_requiring_review = [
        rule.rule_id
        for rule in rule_records
        if rule.requires_review
    ]

    if rules_requiring_review:
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    "Policy cannot be activated while rules "
                    "require human review."
                ),
                "rule_ids": rules_requiring_review,
            },
        )

    
    try:
        candidate_rules = [
            PolicyRule(
                rule_id=rule.rule_id,
                action=rule.action,
                conditions=rule.conditions,
                decision=rule.decision,
                reason=rule.reason,
                priority=rule.priority,
                source=rule.source,
                requires_review=rule.requires_review,
                review_notes=rule.review_notes,
            )
            for rule in rule_records
        ]

        validate_extracted_rules(
            [rule.rule_id for rule in candidate_rules],
            candidate_rules,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Policy version failed validation and cannot be activated: {exc}",
        ) from exc

    if not candidate_rules:
        raise HTTPException(status_code=409, detail="A policy with no rules cannot be activated.")

    previous = (
        db.query(PolicyRecord)
        .filter(
            PolicyRecord.policy_group_id == group.id,
            PolicyRecord.is_active.is_(True),
        )
        .with_for_update()
        .one_or_none()
    )
    if previous is not None and previous.id == target.id:
        return _policy_response(target)
    if action == "rollback" and (
        previous is None or target.version_number >= previous.version_number
    ):
        raise HTTPException(
            status_code=409,
            detail="Rollback must target an older validated policy version.",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if previous is not None:
        previous.is_active = False
        previous.status = "superseded"
    target.status = "active"
    target.is_active = True
    target.activated_at = now
    target.activated_by_user_id = context.user_id
    db.add(
        PolicyActivationEventRecord(
            policy_group_id=group.id,
            policy_id=target.id,
            replaced_policy_id=previous.id if previous is not None else None,
            actor_user_id=context.user_id,
            action=action,
        )
    )
    db.commit()
    return _policy_response(target)


@app.post("/v1/policies/groups/{policy_group_id}/versions/{version_id}/activate")
def activate_policy_version(
    policy_group_id: UUID,
    version_id: int,
    context: UserContext = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        return _activate_policy_version(
            db, policy_group_id, version_id, context, "activate"
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logging.exception("Policy activation failed for version %s", version_id)
        raise HTTPException(status_code=500, detail="Could not activate policy version.")
    finally:
        db.close()


@app.post("/v1/policies/groups/{policy_group_id}/versions/{version_id}/rollback")
def rollback_policy_version(
    policy_group_id: UUID,
    version_id: int,
    context: UserContext = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        return _activate_policy_version(
            db, policy_group_id, version_id, context, "rollback"
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logging.exception("Policy rollback failed for version %s", version_id)
        raise HTTPException(status_code=500, detail="Could not roll back policy version.")
    finally:
        db.close()


@app.post("/v1/gmail/decide", response_model=DecisionResponse)
def gmail_decision(
    email: EmailRequest,
    context: UserContext = Depends(get_current_user),
):
    db = SessionLocal()
    request_id = str(uuid4())
    try:
        active_versions = (
            db.query(PolicyRecord)
            .join(PolicyGroupRecord)
            .filter(
                PolicyGroupRecord.organization_id == context.workspace_id,
                PolicyRecord.is_active.is_(True),
                PolicyRecord.status == "active",
            )
            .order_by(PolicyGroupRecord.id, PolicyRecord.version_number)
            .all()
        )
        policy_rules: list[PolicyRule] = []
        rule_provenance: dict[int, tuple[int, str]] = {}
        evaluated_rules: list[dict] = []
        for version in active_versions:
            rules = [
                PolicyRule(
                    rule_id=rule.rule_id,
                    action=rule.action,
                    conditions=rule.conditions,
                    decision=rule.decision,
                    reason=rule.reason,
                    priority=rule.priority,
                    source=rule.source,
                )
                for rule in sorted(version.rules, key=lambda record: record.rule_id)
            ]
            policy_rules.extend(rules)
            for rule in rules:
                rule_provenance[id(rule)] = (version.id, version.policy_group_id)

        policy_rules.sort(key=lambda rule: (
            -rule.priority,
            rule.rule_id,
            rule_provenance[id(rule)][1],
            rule_provenance[id(rule)][0],
        ))

        response = decide(email, policy_rules)
        action = response.intent
        facts = {
            "amount": email.amount,
            "days_since_purchase": email.days_since_purchase,
            "evidence_present": email.evidence_present,
            "fraud_indicator": email.fraud_indicator,
        }
        matching = find_matching_rules(policy_rules, action, facts)
        matched_rule_objects = {id(rule) for rule in matching}
        evaluated_rules = [
            {
                "rule_id": rule.rule_id,
                "policy_version_id": rule_provenance[id(rule)][0],
                "priority": rule.priority,
                "decision": rule.decision,
                "matched": id(rule) in matched_rule_objects,
            }
            for rule in policy_rules
            if rule.action == action
        ]
        top_matches = (
            [rule for rule in matching if rule.priority == matching[0].priority]
            if matching
            else []
        )
        used_rules = top_matches if response.rules_used else []
        used_version_ids = {
            rule_provenance[id(rule)][0] for rule in used_rules
        }
        policy_version_id = next(iter(used_version_ids)) if len(used_version_ids) == 1 else None
        used_group_ids = {rule_provenance[id(rule)][1] for rule in used_rules}
        policy_group_id = next(iter(used_group_ids)) if len(used_group_ids) == 1 else None
        response.request_id = request_id
        response.policy_version_id = policy_version_id

        db.add(
            DecisionLogRecord(
                id=request_id,
                request_id=request_id,
                organization_id=context.workspace_id,
                policy_group_id=policy_group_id,
                policy_version_id=policy_version_id,
                decision_status=(
                    "review_required"
                    if response.request_approval
                    else "decided"
                ),
                decision_outcome=response.decision,
                decision_reason=response.reason,
                input_snapshot={
                    "amount": email.amount,
                    "days_since_purchase": email.days_since_purchase,
                    "evidence_present": email.evidence_present,
                    "fraud_indicator": email.fraud_indicator,
                },
                rules_evaluated=evaluated_rules,
                matched_rule_ids=response.rules_used,
                engine_version="2.0",
                request_source="gmail_api",
                actor_user_id=context.user_id,
            )
        )
        db.commit()
        return response
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logging.exception("Decision evaluation or audit persistence failed")
        raise HTTPException(
            status_code=503,
            detail="Could not evaluate and durably audit the decision.",
        ) from exc
    finally:
        db.close()


@app.get("/v1/decisions")
def list_decisions(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    policy_version_id: int | None = None,
    outcome: str | None = None,
    request_id: UUID | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    context: UserContext = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        query = db.query(DecisionLogRecord).filter(
            DecisionLogRecord.organization_id == context.workspace_id
        )
        if policy_version_id is not None:
            query = query.filter(DecisionLogRecord.policy_version_id == policy_version_id)
        if outcome:
            query = query.filter(DecisionLogRecord.decision_outcome == outcome)
        if request_id:
            query = query.filter(DecisionLogRecord.request_id == str(request_id))
        if start_date:
            query = query.filter(DecisionLogRecord.created_at >= start_date)
        if end_date:
            query = query.filter(DecisionLogRecord.created_at <= end_date)

        total = query.count()
        records = (
            query.order_by(DecisionLogRecord.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": [_decision_response(record) for record in records],
        }
    finally:
        db.close()


@app.get("/v1/decisions/{decision_id}")
def get_decision(
    decision_id: UUID,
    context: UserContext = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        record = (
            db.query(DecisionLogRecord)
            .filter(
                DecisionLogRecord.id == str(decision_id),
                DecisionLogRecord.organization_id == context.workspace_id,
            )
            .one_or_none()
        )
        if record is None:
            raise HTTPException(status_code=404, detail="Decision not found.")
        return _decision_response(record)
    finally:
        db.close()


def _decision_response(record: DecisionLogRecord) -> dict:
    return {
        "id": record.id,
        "request_id": record.request_id,
        "policy_group_id": record.policy_group_id,
        "policy_version_id": record.policy_version_id,
        "created_at": record.created_at.isoformat(),
        "decision_status": record.decision_status,
        "decision_outcome": record.decision_outcome,
        "decision_reason": record.decision_reason,
        "input_snapshot": record.input_snapshot,
        "rules_evaluated": record.rules_evaluated,
        "matched_rule_ids": record.matched_rule_ids,
        "engine_version": record.engine_version,
        "request_source": record.request_source,
        "actor_user_id": record.actor_user_id,
    }