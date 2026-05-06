"""
Remediation workflow — end-to-end orchestration:

  1. Fetch recommendation from DB
  2. Generate plan via planning service
  3. Run sandbox verification (if enabled + policy allows)
  4. Transition to AWAITING_APPROVAL
  5. Send callback to BLACKGLASS
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.domain.enums import RecommendationStatus, RiskPolicyTier
from app.infra.repositories.recommendation_repo import RecommendationRepository
from app.services.blackglass_client import get_blackglass_client
from app.services.planning_service import PlanningService
from app.services.verification_service import VerificationService

logger = get_logger(__name__)


class RemediationWorkflow:
    """
    Top-level workflow coordinator.

    Keeps orchestration logic in one place so route handlers stay thin.
    All risky steps are delegated to injectable services for easy test stubbing.
    """

    def __init__(
        self,
        session: AsyncSession,
        planning_service: PlanningService | None = None,
        verification_service: VerificationService | None = None,
    ) -> None:
        self._session = session
        self._repo = RecommendationRepository(session)
        self._planning = planning_service or PlanningService(session)
        self._verification = verification_service or VerificationService(session)

    async def run(self, recommendation_id: str) -> None:
        """
        Execute the full remediation workflow for a given recommendation ID.

        This is designed to be called from a background task.
        It is safe to call multiple times (idempotent for completed states).
        """
        rec = await self._repo.get(recommendation_id)
        if rec is None:
            logger.error("workflow_rec_not_found", recommendation_id=recommendation_id)
            return

        # Skip if already in a terminal or post-planning state
        if rec.status not in (RecommendationStatus.DRAFT,):
            logger.info(
                "workflow_skipped_already_processed",
                recommendation_id=recommendation_id,
                status=rec.status,
            )
            return

        logger.info(
            "workflow_start",
            recommendation_id=recommendation_id,
            tier=rec.risk_policy_tier,
        )

        # --- Step 1: Generate plan ---
        try:
            rec = await self._planning.generate_plan(rec)
        except Exception as e:
            logger.error("workflow_planning_error", error=str(e))
            return

        if rec.status == RecommendationStatus.FAILED:
            await self._notify_blackglass(rec)
            return

        # --- Step 2: Sandbox verification (if applicable) ---
        tier = rec.risk_policy_tier
        should_verify = tier in (
            RiskPolicyTier.SANDBOX_VERIFIABLE,
            RiskPolicyTier.APPROVAL_REQUIRED,
        )

        if should_verify and rec.plan and rec.plan.commands:
            try:
                rec = await self._verification.verify(rec)
            except Exception as e:
                logger.error("workflow_verification_error", error=str(e))
                rec.append_audit(f"verification_skipped_due_to_error: {e}")
                rec.status = RecommendationStatus.AWAITING_APPROVAL
                await self._repo.save(rec)
                await self._session.commit()
        elif rec.status == RecommendationStatus.DRAFT:
            # No verification needed — move forward
            rec.status = RecommendationStatus.AWAITING_APPROVAL
            await self._repo.save(rec)
            await self._session.commit()

        # --- Step 3: Notify BLACKGLASS ---
        await self._notify_blackglass(rec)

        logger.info(
            "workflow_complete",
            recommendation_id=recommendation_id,
            status=rec.status,
        )

    async def _notify_blackglass(self, rec) -> None:
        """Send a status callback to BLACKGLASS (fire-and-forget, non-fatal)."""
        client = get_blackglass_client()
        if client is None:
            return
        try:
            summary = rec.plan.summary if rec.plan else None
            confidence = rec.plan.confidence_score if rec.plan else None
            await client.post_remediation_status(
                tenant_id=rec.tenant_id,
                recommendation_id=rec.id,
                status=rec.status,
                summary=summary,
                confidence_score=confidence,
            )
        except Exception as e:
            logger.warning("blackglass_notify_failed", error=str(e))
        finally:
            await client.aclose()
