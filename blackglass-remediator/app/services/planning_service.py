"""
Planning service — drives the agent to generate a RemediationPlan
from a RemediationRecommendation.
"""

from __future__ import annotations

import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.models import AgentInput
from app.agent.remediation_agent import AgentError, RemediationAgent
from app.agent.risk_policy import get_allowed_commands_for_policy
from app.agent.tools import get_distribution_family
from app.core.logging import get_logger
from app.domain.enums import RecommendationStatus, RiskPolicyTier
from app.domain.recommendation import RemediationRecommendation
from app.infra.repositories.recommendation_repo import RecommendationRepository

logger = get_logger(__name__)


class PlanningService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = RecommendationRepository(session)
        self._session = session

    async def generate_plan(
        self, rec: RemediationRecommendation
    ) -> RemediationRecommendation:
        """
        Run the remediation agent and attach the plan to the recommendation.
        Returns the updated recommendation.
        """
        if rec.risk_policy_tier is None:
            raise ValueError("Recommendation has no risk_policy_tier assigned")

        event = rec.drift_event
        tier = rec.risk_policy_tier
        allowed_cmds = get_allowed_commands_for_policy(tier)
        dist_family = get_distribution_family(event.host_context)

        findings_summary = "\n".join(
            f"- [{f.severity.upper()}] {f.title} ({f.category}): {f.rationale}"
            for f in event.findings
        )

        agent_input = AgentInput(
            category=event.primary_category,
            severity=event.primary_severity,
            distro=event.host_context.distro,
            kernel=event.host_context.kernel,
            hostname=event.host_context.hostname,
            policy_tier=tier,
            allowed_commands=allowed_cmds,
            findings_summary=findings_summary,
            baseline_summary=event.baseline_summary,
            current_summary=event.current_summary,
            raw_diff=str(event.raw_diff) if event.raw_diff else None,
            scan_id=event.scan_id,
        )

        agent = RemediationAgent()
        t0 = time.monotonic()

        try:
            plan = await agent.plan(agent_input)
            duration_ms = int((time.monotonic() - t0) * 1000)

            rec.plan = plan
            rec.append_audit(
                f"plan_generated: plan_id={plan.plan_id} "
                f"commands={len(plan.commands)} "
                f"confidence={plan.confidence_score:.2f} "
                f"model={plan.model_name} "
                f"duration_ms={duration_ms}"
            )

            # Move to awaiting_approval if guidance-only (no sandbox needed)
            if tier in (RiskPolicyTier.SAFE_GUIDANCE_ONLY, RiskPolicyTier.MANUAL_ONLY):
                rec.status = RecommendationStatus.AWAITING_APPROVAL
            else:
                rec.status = RecommendationStatus.DRAFT  # Awaits sandbox verification

        except AgentError as e:
            rec.append_audit(f"plan_generation_failed: {e}")
            rec.status = RecommendationStatus.FAILED
            logger.error(
                "planning_failed",
                recommendation_id=rec.id,
                error=str(e),
            )

        await self._repo.save(rec)
        await self._session.commit()
        return rec
