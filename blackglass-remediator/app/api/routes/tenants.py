"""Tenant-scoped remediation listing endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session
from app.domain.recommendation import RemediationRecommendation
from app.infra.repositories.recommendation_repo import RecommendationRepository

router = APIRouter(prefix="/tenants", tags=["tenants"])


class RecommendationList(BaseModel):
    items: list[RemediationRecommendation]
    total: int
    limit: int
    offset: int


@router.get("/{tenant_id}/remediations", response_model=RecommendationList)
async def list_tenant_remediations(
    tenant_id: str,
    workspace_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_db_session),
) -> RecommendationList:
    """List all remediation recommendations for a tenant (paginated)."""
    repo = RecommendationRepository(session)
    items = await repo.list_for_tenant(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        limit=limit,
        offset=offset,
    )
    return RecommendationList(
        items=items,
        total=len(items),  # Use COUNT query in production
        limit=limit,
        offset=offset,
    )
