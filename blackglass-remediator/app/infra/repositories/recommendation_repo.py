"""Repository pattern for RemediationRecommendation persistence."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.recommendation import RemediationRecommendation
from app.infra.db.models import RecommendationRow


class RecommendationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, rec: RemediationRecommendation) -> None:
        data = rec.model_dump(mode="json")
        row = await self._session.get(RecommendationRow, rec.id)
        if row is None:
            row = RecommendationRow(
                id=rec.id,
                tenant_id=rec.tenant_id,
                workspace_id=rec.workspace_id,
                status=rec.status,
                risk_policy_tier=rec.risk_policy_tier,
                drift_event=data["drift_event"],
                plan=data.get("plan"),
                verification_result=data.get("verification_result"),
                approval=data.get("approval"),
                audit_log=data.get("audit_log", []),
                verified_at=rec.verified_at,
                approved_at=rec.approved_at,
                expired_at=rec.expired_at,
            )
            self._session.add(row)
        else:
            row.status = rec.status
            row.risk_policy_tier = rec.risk_policy_tier
            row.plan = data.get("plan")
            row.verification_result = data.get("verification_result")
            row.approval = data.get("approval")
            row.audit_log = data.get("audit_log", [])
            row.updated_at = datetime.utcnow()
            row.verified_at = rec.verified_at
            row.approved_at = rec.approved_at
            row.expired_at = rec.expired_at
        await self._session.flush()

    async def get(self, recommendation_id: str) -> RemediationRecommendation | None:
        row = await self._session.get(RecommendationRow, recommendation_id)
        if row is None:
            return None
        return self._row_to_domain(row)

    async def list_for_tenant(
        self,
        tenant_id: str,
        workspace_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[RemediationRecommendation]:
        stmt = (
            select(RecommendationRow)
            .where(RecommendationRow.tenant_id == tenant_id)
            .order_by(RecommendationRow.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if workspace_id:
            stmt = stmt.where(RecommendationRow.workspace_id == workspace_id)

        result = await self._session.execute(stmt)
        return [self._row_to_domain(row) for row in result.scalars()]

    def _row_to_domain(self, row: RecommendationRow) -> RemediationRecommendation:
        return RemediationRecommendation.model_validate(
            {
                "id": row.id,
                "tenant_id": row.tenant_id,
                "workspace_id": row.workspace_id,
                "status": row.status,
                "risk_policy_tier": row.risk_policy_tier,
                "drift_event": row.drift_event,
                "plan": row.plan,
                "verification_result": row.verification_result,
                "approval": row.approval,
                "audit_log": row.audit_log or [],
                "created_at": row.created_at,
                "updated_at": row.updated_at,
                "verified_at": row.verified_at,
                "approved_at": row.approved_at,
                "expired_at": row.expired_at,
            }
        )
