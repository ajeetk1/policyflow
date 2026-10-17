import pytest
from fastapi import HTTPException
from uuid import uuid4

from app import main


def test_upload_job_is_hidden_from_another_workspace(monkeypatch):
    job_id = uuid4()
    job = {
        "job_id": str(job_id),
        "workspace_id": "workspace_one",
        "status": "completed",
    }

    monkeypatch.setattr(main, "_read_upload_job", lambda _: job)

    with pytest.raises(HTTPException) as exc:
        main._get_user_upload_job(job_id, "workspace_two")

    assert exc.value.status_code == 404
    assert exc.value.detail == "Policy upload job not found."


def test_upload_job_is_accessible_to_its_own_workspace(monkeypatch):
    job_id = uuid4()
    job = {
        "job_id": str(job_id),
        "workspace_id": "workspace_one",
        "status": "completed",
    }

    monkeypatch.setattr(main, "_read_upload_job", lambda _: job)

    result = main._get_user_upload_job(job_id, "workspace_one")

    assert result["job_id"] == str(job_id)
    assert result["status"] == "completed"


def test_public_upload_job_does_not_expose_workspace_id():
    job = {
        "job_id": "job-123",
        "workspace_id": "private-workspace",
        "status": "processing",
        "policy_status": "processing",
    }

    result = main._public_upload_job(job)

    assert "workspace_id" not in result
    assert result["job_id"] == "job-123"
    assert result["status"] == "processing"


def test_completed_upload_cannot_be_retried(monkeypatch):
    from fastapi import BackgroundTasks
    from app.auth import UserContext

    job_id = uuid4()
    job = {
        "job_id": str(job_id),
        "workspace_id": "workspace_one",
        "status": "completed",
    }

    monkeypatch.setattr(main, "_get_user_upload_job", lambda *_: job)

    with pytest.raises(HTTPException) as exc:
        main.retry_policy_upload(
            job_id,
            BackgroundTasks(),
            UserContext(workspace_id="workspace_one", user_id="user_one"),
        )

    assert exc.value.status_code == 409
    assert "Only failed" in exc.value.detail


def test_failed_upload_without_pdf_cannot_be_retried(monkeypatch):
    from fastapi import BackgroundTasks
    from app.auth import UserContext

    job_id = uuid4()
    job = {
        "job_id": str(job_id),
        "workspace_id": "workspace_one",
        "status": "failed",
    }

    monkeypatch.setattr(main, "_get_user_upload_job", lambda *_: job)
    monkeypatch.setattr(
        main,
        "_upload_file_path",
        lambda _: __import__("pathlib").Path("/tmp/policyflow-test-missing.pdf"),
    )

    with pytest.raises(HTTPException) as exc:
        main.retry_policy_upload(
            job_id,
            BackgroundTasks(),
            UserContext(workspace_id="workspace_one", user_id="user_one"),
        )

    assert exc.value.status_code == 404
    assert "PDF" in exc.value.detail
