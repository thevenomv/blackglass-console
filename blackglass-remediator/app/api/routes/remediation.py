"""Remediation recommendation read endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session
from app.core.logging import get_logger
from app.domain.recommendation import RemediationRecommendation
from app.infra.repositories.recommendation_repo import RecommendationRepository
from app.workflows.replay_workflow import ReplayWorkflow

logger = get_logger(__name__)
router = APIRouter(prefix="/remediations", tags=["remediations"])


class ReplayRequest(BaseModel):
    dry_run: bool = False


@router.get("/{recommendation_id}", response_model=RemediationRecommendation)
async def get_recommendation(
    recommendation_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> RemediationRecommendation:
    """Return a single remediation recommendation with all artefacts."""
    repo = RecommendationRepository(session)
    rec = await repo.get(recommendation_id)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recommendation {recommendation_id!r} not found",
        )
    return rec


@router.post("/{recommendation_id}/replay", response_model=RemediationRecommendation)
async def replay_recommendation(
    recommendation_id: str,
    body: ReplayRequest = ReplayRequest(),
    session: AsyncSession = Depends(get_db_session),
) -> RemediationRecommendation:
    """
    Re-run planning + sandbox verification for the same drift input.
    Pass dry_run=true to re-generate the plan only (no sandbox).
    """
    repo = RecommendationRepository(session)
    rec = await repo.get(recommendation_id)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recommendation {recommendation_id!r} not found",
        )

    workflow = ReplayWorkflow(session=session)
    updated = await workflow.replay(rec, dry_run=body.dry_run)
    return updated
