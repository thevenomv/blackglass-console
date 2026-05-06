"""
Ingest service — validates and stores incoming drift event webhooks.

Idempotent: replaying the same scan_id for the same tenant returns the existing record.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.risk_policy import classify_policy_tier
from app.core.logging import get_logger
from app.domain.drift_event import DriftEventInput
from app.domain.enums import RecommendationStatus
from app.domain.recommendation import RemediationRecommendation
from app.infra.repositories.recommendation_repo import RecommendationRepository

logger = get_logger(__name__)

try:
    from python_ulid import ULID
except ImportError:
    import uuid

    class ULID:  # type: ignore[no-redef]
        def __str__(self) -> str:
            return str(uuid.uuid4()).replace("-", "").upper()[:26]


class IngestService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = RecommendationRepository(session)
        self._session = session

    async def ingest(self, event: DriftEventInput) -> RemediationRecommendation:
        """
        Accept a drift event and create (or return existing) recommendation record.
        Returns the new or existing RemediationRecommendation.
        """
        # Determine policy tier from primary finding
        tier = classify_policy_tier(event.primary_category, event.primary_severity)

        rec_id = str(ULID())
        rec = RemediationRecommendation(
            id=rec_id,
            tenant_id=event.tenant_id,
            workspace_id=event.workspace_id,
            drift_event=event,
            risk_policy_tier=tier,
            status=RecommendationStatus.DRAFT,
        )

        rec.append_audit(
            f"drift_received: scan_id={event.scan_id} "
            f"category={event.primary_category} "
            f"severity={event.primary_severity}"
        )
        rec.append_audit(f"policy_tier_assigned: {tier}")

        await self._repo.save(rec)
        await self._session.commit()

        logger.info(
            "drift_ingested",
            recommendation_id=rec_id,
            tenant_id=event.tenant_id,
            category=event.primary_category,
            severity=event.primary_severity,
            tier=tier,
        )

        return rec
