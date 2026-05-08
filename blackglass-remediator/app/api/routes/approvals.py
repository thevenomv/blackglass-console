"""Approval and rejection endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session
from app.core.logging import get_logger
from app.core.security import (
    approval_token_enforcement_enabled,
    verify_approval_token,
)
from app.domain.recommendation import RemediationRecommendation
from app.infra.repositories.recommendation_repo import RecommendationRepository
from app.services.approval_service import ApprovalError, ApprovalService
from app.services.blackglass_client import get_blackglass_client

logger = get_logger(__name__)
router = APIRouter(prefix="/remediations", tags=["approvals"])


class ApprovalRequest(BaseModel):
    actor_id: str
    actor_email: str | None = None
    actor_name: str | None = None
    reason: str | None = None


class RejectionRequest(BaseModel):
    actor_id: str
    actor_email: str | None = None
    actor_name: str | None = None
    reason: str | None = None


@router.post("/{recommendation_id}/approve", response_model=RemediationRecommendation)
async def approve_recommendation(
    recommendation_id: str,
    body: ApprovalRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    x_blackglass_approval_token: str | None = Header(default=None),
) -> RemediationRecommendation:
    """
    Record human approval of a remediation recommendation.

    This is the authoritative gate before any production execution.
    The actor metadata is recorded in the audit log.

    When `REMEDIATOR_APPROVAL_TOKEN_SECRET` is configured the request
    MUST also carry an `X-Blackglass-Approval-Token` header signed by
    the Console with HMAC-SHA256 — see app/core/security.py and the
    Console minter at src/lib/server/remediator/approval-token.ts.
    Without the token a leaked remediator API key alone could
    fabricate approvals; with it, an attacker would need to also
    compromise the Console's signing secret.
    """
    repo = RecommendationRepository(session)
    rec = await repo.get(recommendation_id)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recommendation {recommendation_id!r} not found",
        )

    if approval_token_enforcement_enabled():
        if not x_blackglass_approval_token:
            logger.warning(
                "approval_rejected_no_token", recommendation_id=recommendation_id
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="X-Blackglass-Approval-Token header required",
            )
        verify_approval_token(
            x_blackglass_approval_token,
            expected_recommendation_id=recommendation_id,
            expected_tenant_id=rec.tenant_id,
            expected_decision="approve",
        )

    svc = ApprovalService(session)
    try:
        rec = await svc.approve(
            rec=rec,
            actor_id=body.actor_id,
            actor_email=body.actor_email,
            actor_name=body.actor_name,
            reason=body.reason,
            ip_address=request.client.host if request.client else None,
        )
    except ApprovalError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    # Notify BLACKGLASS asynchronously
    bg_client = get_blackglass_client()
    if bg_client:
        try:
            await bg_client.post_approval_status(
                tenant_id=rec.tenant_id,
                recommendation_id=rec.id,
                approved=True,
                actor_id=body.actor_id,
                reason=body.reason,
            )
        finally:
            await bg_client.aclose()

    logger.info(
        "approval_recorded",
        recommendation_id=recommendation_id,
        actor_id=body.actor_id,
    )
    return rec


@router.post("/{recommendation_id}/reject", response_model=RemediationRecommendation)
async def reject_recommendation(
    recommendation_id: str,
    body: RejectionRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    x_blackglass_approval_token: str | None = Header(default=None),
) -> RemediationRecommendation:
    """Record human rejection of a remediation recommendation.

    Same approval-token enforcement as /approve — symmetric so an
    attacker can't downgrade a leaked-key threat by just rejecting
    pending plans en masse to drown the legit ones.
    """
    repo = RecommendationRepository(session)
    rec = await repo.get(recommendation_id)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recommendation {recommendation_id!r} not found",
        )

    if approval_token_enforcement_enabled():
        if not x_blackglass_approval_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="X-Blackglass-Approval-Token header required",
            )
        verify_approval_token(
            x_blackglass_approval_token,
            expected_recommendation_id=recommendation_id,
            expected_tenant_id=rec.tenant_id,
            expected_decision="reject",
        )

    svc = ApprovalService(session)
    try:
        rec = await svc.reject(
            rec=rec,
            actor_id=body.actor_id,
            actor_email=body.actor_email,
            actor_name=body.actor_name,
            reason=body.reason,
            ip_address=request.client.host if request.client else None,
        )
    except ApprovalError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    bg_client = get_blackglass_client()
    if bg_client:
        try:
            await bg_client.post_approval_status(
                tenant_id=rec.tenant_id,
                recommendation_id=rec.id,
                approved=False,
                actor_id=body.actor_id,
                reason=body.reason,
            )
        finally:
            await bg_client.aclose()

    return rec
