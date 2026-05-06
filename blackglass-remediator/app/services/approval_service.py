"""
Approval service — handles human approval and rejection of recommendations.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.approval import ApprovalRecord
from app.domain.enums import ApprovalStatus, RecommendationStatus
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


class ApprovalError(Exception):
    pass


class ApprovalService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = RecommendationRepository(session)
        self._session = session
        self._settings = get_settings()

    async def approve(
        self,
        rec: RemediationRecommendation,
        actor_id: str,
        actor_email: str | None = None,
        actor_name: str | None = None,
        reason: str | None = None,
        ip_address: str | None = None,
    ) -> RemediationRecommendation:
        """
        Record human approval of a recommendation.

        Only transitions from AWAITING_APPROVAL status are permitted.
        """
        if rec.status != RecommendationStatus.AWAITING_APPROVAL:
            raise ApprovalError(
                f"Cannot approve recommendation in status {rec.status!r}. "
                f"Expected {RecommendationStatus.AWAITING_APPROVAL!r}."
            )

        # Check expiry
        if rec.expired_at and datetime.utcnow() > rec.expired_at:
            rec.status = RecommendationStatus.EXPIRED
            await self._repo.save(rec)
            await self._session.commit()
            raise ApprovalError("Recommendation has expired and can no longer be approved")

        approval = ApprovalRecord(
            approval_id=str(ULID()),
            recommendation_id=rec.id,
            tenant_id=rec.tenant_id,
            status=ApprovalStatus.APPROVED,
            actor_id=actor_id,
            actor_email=actor_email,
            actor_name=actor_name,
            reason=reason,
            ip_address=ip_address,
            decided_at=datetime.utcnow(),
        )

        rec.approval = approval
        rec.status = RecommendationStatus.APPROVED
        rec.approved_at = datetime.utcnow()
        rec.append_audit(
            f"approved: actor_id={actor_id} "
            f"actor_email={actor_email or 'unknown'} "
            f"reason={reason or 'none'}"
        )

        await self._repo.save(rec)
        await self._session.commit()

        logger.info(
            "recommendation_approved",
            recommendation_id=rec.id,
            actor_id=actor_id,
            tenant_id=rec.tenant_id,
        )
        return rec

    async def reject(
        self,
        rec: RemediationRecommendation,
        actor_id: str,
        actor_email: str | None = None,
        actor_name: str | None = None,
        reason: str | None = None,
        ip_address: str | None = None,
    ) -> RemediationRecommendation:
        """
        Record human rejection of a recommendation.
        """
        if rec.status not in (
            RecommendationStatus.AWAITING_APPROVAL,
            RecommendationStatus.DRAFT,
            RecommendationStatus.VERIFIED,
        ):
            raise ApprovalError(
                f"Cannot reject recommendation in status {rec.status!r}"
            )

        approval = ApprovalRecord(
            approval_id=str(ULID()),
            recommendation_id=rec.id,
            tenant_id=rec.tenant_id,
            status=ApprovalStatus.REJECTED,
            actor_id=actor_id,
            actor_email=actor_email,
            actor_name=actor_name,
            reason=reason,
            ip_address=ip_address,
            decided_at=datetime.utcnow(),
        )

        rec.approval = approval
        rec.status = RecommendationStatus.REJECTED
        rec.append_audit(
            f"rejected: actor_id={actor_id} reason={reason or 'none'}"
        )

        await self._repo.save(rec)
        await self._session.commit()

        logger.info(
            "recommendation_rejected",
            recommendation_id=rec.id,
            actor_id=actor_id,
            tenant_id=rec.tenant_id,
        )
        return rec

    async def expire_stale(self) -> int:
        """
        Expire recommendations that have been awaiting approval beyond the TTL.
        Intended to be called by a background task or cron.
        Returns number of records expired.
        """
        # In a full implementation, query DB for all AWAITING_APPROVAL records
        # where updated_at < (now - expiry_hours).
        # For MVP, this is a placeholder.
        logger.info("expire_stale_called — implement batch query in production")
        return 0
