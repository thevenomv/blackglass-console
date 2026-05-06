"""
Replay workflow — re-runs planning (and optionally verification) for
an existing recommendation from its original drift event input.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.domain.enums import RecommendationStatus, RiskPolicyTier
from app.domain.recommendation import RemediationRecommendation
from app.infra.repositories.recommendation_repo import RecommendationRepository
from app.services.planning_service import PlanningService
from app.services.verification_service import VerificationService

logger = get_logger(__name__)


class ReplayWorkflow:
    """Re-runs planning and optionally verification for an existing recommendation."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = RecommendationRepository(session)
        self._planning = PlanningService(session)
        self._verification = VerificationService(session)

    async def replay(
        self,
        rec: RemediationRecommendation,
        dry_run: bool = False,
    ) -> RemediationRecommendation:
        """
        Replay the workflow from the planning step.

        dry_run=True: re-generates the plan but skips sandbox verification.
        """
        logger.info(
            "replay_start",
            recommendation_id=rec.id,
            dry_run=dry_run,
        )

        # Reset to DRAFT for replay
        rec.status = RecommendationStatus.DRAFT
        rec.plan = None
        rec.verification_result = None
        rec.approval = None
        rec.approved_at = None
        rec.verified_at = None
        rec.append_audit(f"replay_started: dry_run={dry_run}")
        await self._repo.save(rec)
        await self._session.commit()

        # Re-run planning
        rec = await self._planning.generate_plan(rec)
        if rec.status == RecommendationStatus.FAILED:
            return rec

        # Re-run verification if applicable and not dry_run
        tier = rec.risk_policy_tier
        if (
            not dry_run
            and tier in (RiskPolicyTier.SANDBOX_VERIFIABLE, RiskPolicyTier.APPROVAL_REQUIRED)
            and rec.plan
            and rec.plan.commands
        ):
            rec = await self._verification.verify(rec)
        elif rec.status == RecommendationStatus.DRAFT:
            rec.status = RecommendationStatus.AWAITING_APPROVAL
            await self._repo.save(rec)
            await self._session.commit()

        rec.append_audit(f"replay_complete: status={rec.status}")
        await self._repo.save(rec)
        await self._session.commit()

        logger.info(
            "replay_complete",
            recommendation_id=rec.id,
            status=rec.status,
        )
        return rec
