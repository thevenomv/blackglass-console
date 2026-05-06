"""Webhook ingestion routes — receives drift events from BLACKGLASS."""

from __future__ import annotations

import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session
from app.core.logging import get_logger
from app.core.security import get_webhook_body_and_verify
from app.domain.drift_event import DriftEventInput, DriftFinding, HostContext
from app.services.ingest_service import IngestService
from app.workflows.remediation_workflow import RemediationWorkflow

logger = get_logger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class WebhookAck(BaseModel):
    accepted: bool
    recommendation_id: str | None = None
    message: str | None = None


@router.post(
    "/blackglass/drift",
    response_model=WebhookAck,
    status_code=status.HTTP_202_ACCEPTED,
)
async def receive_drift_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    raw_body: bytes = Depends(get_webhook_body_and_verify),
    session: AsyncSession = Depends(get_db_session),
) -> WebhookAck:
    """
    Receive a drift event webhook from BLACKGLASS.

    Validates the payload, creates a recommendation record, and kicks off
    the remediation workflow in the background.

    Expected payload (BLACKGLASS outbound-webhook format + tenant context):
    {
        "event": "drift.detected",
        "scan_id": "<uuid>",
        "tenant_id": "<uuid>",
        "workspace_id": "<uuid|null>",
        "host_id": "<string>",
        "hostname": "<string>",
        "timestamp": "<ISO 8601>",
        "distro": "<string|optional>",
        "kernel": "<string|optional>",
        "findings": [
            {
                "id": "<uuid>",
                "category": "<DriftCategory>",
                "severity": "high|medium|low",
                "title": "<string>",
                "rationale": "<string>"
            }
        ],
        "baseline_summary": "<string|optional>",
        "current_summary": "<string|optional>",
        "raw_diff": {...} | null
    }
    """
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    # Normalise BLACKGLASS webhook format → DriftEventInput
    try:
        event = _normalise_payload(payload)
    except (ValidationError, KeyError, ValueError) as e:
        logger.warning("webhook_payload_invalid", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Payload validation error: {e}",
        )

    ingest = IngestService(session)
    rec = await ingest.ingest(event)

    # Kick off the full workflow asynchronously
    background_tasks.add_task(
        _run_workflow_background, rec.id, event.tenant_id
    )

    logger.info(
        "drift_webhook_accepted",
        recommendation_id=rec.id,
        scan_id=event.scan_id,
        tenant_id=event.tenant_id,
    )

    return WebhookAck(
        accepted=True,
        recommendation_id=rec.id,
        message=f"Drift event accepted. Recommendation {rec.id} created.",
    )


def _normalise_payload(payload: dict) -> DriftEventInput:
    """
    Translate BLACKGLASS outbound-webhook JSON → DriftEventInput.

    Handles both the original BLACKGLASS format and the enriched remediator format.
    """
    # Support both snake_case (enriched) and camelCase / original format
    scan_id = payload.get("scan_id") or payload.get("scanId", "")
    host_id = payload.get("host_id") or payload.get("hostId", "")
    hostname = payload.get("hostname", host_id)
    tenant_id = payload.get("tenant_id") or payload.get("tenantId", "")
    workspace_id = payload.get("workspace_id") or payload.get("workspaceId")
    timestamp = payload.get("timestamp", "")

    findings_raw = payload.get("findings", [])
    findings = [
        DriftFinding(
            id=f.get("id", ""),
            category=f.get("category", "other"),
            severity=f.get("severity", "low"),
            title=f.get("title", ""),
            rationale=f.get("rationale", ""),
        )
        for f in findings_raw
    ]

    from datetime import datetime, timezone

    try:
        scan_ts = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        scan_ts = datetime.now(timezone.utc)

    host_context = HostContext(
        host_id=host_id,
        hostname=hostname,
        distro=payload.get("distro", "unknown"),
        kernel=payload.get("kernel", "unknown"),
        scan_timestamp=scan_ts,
    )

    return DriftEventInput(
        event=payload.get("event", "drift.detected"),
        scan_id=scan_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        host_context=host_context,
        findings=findings,
        baseline_summary=payload.get("baseline_summary"),
        current_summary=payload.get("current_summary"),
        raw_diff=payload.get("raw_diff"),
    )


async def _run_workflow_background(recommendation_id: str, tenant_id: str) -> None:
    """Background task: run the full remediation workflow for the given rec."""
    from app.infra.db.models import get_session_factory

    factory = get_session_factory()
    async with factory() as session:
        workflow = RemediationWorkflow(session=session)
        await workflow.run(recommendation_id=recommendation_id)
