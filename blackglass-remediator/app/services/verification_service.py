"""
Verification service — runs remediation commands in the sandbox and checks results.

Pipeline:
  1. provision_sandbox()
  2. replay_drift_state()
  3. run_remediation_commands()
  4. run_verification_checks()
  5. destroy_sandbox()
"""

from __future__ import annotations

import asyncio
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.enums import SandboxStatus, VerificationOutcome
from app.domain.recommendation import RemediationRecommendation
from app.domain.remediation_plan import RemediationPlan
from app.domain.verification_result import (
    CheckResult,
    CommandExecutionResult,
    SandboxInfo,
    VerificationArtifact,
    VerificationResult,
)
from app.infra.repositories.recommendation_repo import RecommendationRepository
from app.infra.ssh_runner import SandboxSSHRunner
from app.services.sandbox_service import SandboxService

logger = get_logger(__name__)

try:
    from python_ulid import ULID
except ImportError:
    import uuid

    class ULID:  # type: ignore[no-redef]
        def __str__(self) -> str:
            return str(uuid.uuid4()).replace("-", "").upper()[:26]


class VerificationService:
    """Orchestrates the full sandbox verification pipeline."""

    def __init__(
        self,
        session: AsyncSession,
        sandbox_service: SandboxService | None = None,
        private_key: str | None = None,
    ) -> None:
        self._repo = RecommendationRepository(session)
        self._session = session
        self._sandbox_svc = sandbox_service or SandboxService()
        self._private_key = private_key
        self._settings = get_settings()

    async def verify(
        self, rec: RemediationRecommendation
    ) -> RemediationRecommendation:
        """
        Run full sandbox verification for the given recommendation.
        Updates the recommendation with the result and returns it.
        """
        if rec.plan is None:
            raise ValueError("Cannot verify a recommendation without a plan")

        if not self._settings.enable_sandbox_verification:
            rec.append_audit("sandbox_verification_skipped: ENABLE_SANDBOX_VERIFICATION=false")
            # Still mark as awaiting approval without verification
            from app.domain.enums import RecommendationStatus
            rec.status = RecommendationStatus.AWAITING_APPROVAL
            rec.plan = rec.plan.model_copy(update={"confidence_score": 0.4})
            await self._repo.save(rec)
            await self._session.commit()
            return rec

        sandbox_info = await self._sandbox_svc.provision(
            recommendation_id=rec.id,
            distro=rec.drift_event.host_context.distro,
        )
        rec.append_audit(
            f"sandbox_provisioned: droplet_id={sandbox_info.droplet_id} "
            f"ip={sandbox_info.droplet_ip}"
        )

        artifact_id = str(ULID())
        artifact = VerificationArtifact(
            artifact_id=artifact_id,
            recommendation_id=rec.id,
            sandbox_info=sandbox_info,
            started_at=datetime.utcnow(),
        )

        try:
            artifact = await self._run_pipeline(rec.plan, artifact)
            outcome = self._determine_outcome(artifact)
            confidence_adj = 0.2 if outcome == VerificationOutcome.PASSED else -0.3

            result_id = str(ULID())
            passed = sum(1 for c in artifact.check_results if c.passed)
            total = len(artifact.check_results)

            verification_result = VerificationResult(
                result_id=result_id,
                recommendation_id=rec.id,
                outcome=outcome,
                passed_checks=passed,
                total_checks=total,
                summary=(
                    f"Sandbox verification {outcome}: {passed}/{total} checks passed"
                ),
                artifacts=[artifact],
                confidence_adjustment=confidence_adj,
                verified_at=datetime.utcnow(),
            )

            # Adjust confidence
            new_confidence = min(
                1.0, max(0.0, rec.plan.confidence_score + confidence_adj)
            )
            rec.plan = rec.plan.model_copy(update={"confidence_score": new_confidence})
            rec.verification_result = verification_result
            rec.verified_at = datetime.utcnow()

            from app.domain.enums import RecommendationStatus

            if outcome == VerificationOutcome.PASSED:
                rec.status = RecommendationStatus.AWAITING_APPROVAL
                rec.append_audit(
                    f"sandbox_verification_passed: checks={passed}/{total} "
                    f"confidence_adj={confidence_adj:+.2f}"
                )
            else:
                rec.status = RecommendationStatus.DRAFT  # needs review
                rec.append_audit(
                    f"sandbox_verification_failed: checks={passed}/{total} "
                    f"downgraded_confidence={new_confidence:.2f}"
                )

        except Exception as e:
            logger.error(
                "verification_pipeline_error",
                recommendation_id=rec.id,
                error=str(e),
            )
            rec.append_audit(f"sandbox_verification_error: {e}")
            from app.domain.enums import RecommendationStatus

            rec.status = RecommendationStatus.FAILED
        finally:
            # Always destroy the sandbox
            try:
                await self._sandbox_svc.destroy(sandbox_info)
                rec.append_audit("sandbox_destroyed")
            except Exception as e:
                rec.append_audit(f"sandbox_destroy_failed: {e}")

        await self._repo.save(rec)
        await self._session.commit()
        return rec

    async def _run_pipeline(
        self, plan: RemediationPlan, artifact: VerificationArtifact
    ) -> VerificationArtifact:
        """Execute the 4-step verification pipeline inside the sandbox."""
        if not artifact.sandbox_info.droplet_ip:
            raise ValueError("Sandbox has no IP address")

        # Wait briefly for SSH to become available
        await asyncio.sleep(10)

        async with SandboxSSHRunner(
            host=artifact.sandbox_info.droplet_ip,
            private_key=self._private_key,
        ) as ssh:
            # Step 1: verify SSH connection
            ping = await ssh.run("echo 'sandbox-ok'")
            if not ping.succeeded:
                raise RuntimeError("Cannot connect to sandbox via SSH")

            # Step 2: replay drift state (inject the drifted condition)
            drift_log = await self._replay_drift_state(ssh, plan)
            artifact = artifact.model_copy(update={"drift_replay_log": drift_log})

            # Step 3: run remediation commands
            cmd_results = []
            for cmd in plan.commands:
                result = await ssh.run(cmd.command)
                cmd_results.append(
                    CommandExecutionResult(
                        command_id=cmd.id,
                        command=cmd.command,
                        exit_code=result.exit_code,
                        stdout=result.stdout[:4000],
                        stderr=result.stderr[:2000],
                    )
                )
                logger.debug(
                    "verification_command_run",
                    command_id=cmd.id,
                    exit_code=result.exit_code,
                )

            # Step 4: run verification checks
            check_results = []
            for check in plan.verification_steps:
                result = await ssh.run(check.command)
                passed = result.exit_code == check.expected_exit_code
                if check.expected_output_contains:
                    passed = passed and (check.expected_output_contains in result.stdout)
                check_results.append(
                    CheckResult(
                        check_id=check.id,
                        description=check.description,
                        command=check.command,
                        exit_code=result.exit_code,
                        stdout=result.stdout[:2000],
                        passed=passed,
                        failure_reason=(
                            None
                            if passed
                            else f"exit_code={result.exit_code} stderr={result.stderr[:200]}"
                        ),
                    )
                )

        artifact = artifact.model_copy(
            update={
                "command_results": cmd_results,
                "check_results": check_results,
                "completed_at": datetime.utcnow(),
            }
        )
        return artifact

    async def _replay_drift_state(
        self, ssh: SandboxSSHRunner, plan: RemediationPlan
    ) -> str:
        """
        Attempt to replicate the drift condition in the sandbox
        so remediation commands have something to fix.

        Currently a best-effort replay based on category heuristics.
        More sophisticated replay can be added per category later.
        """
        # For now just confirm sandbox is clean — category-specific replay
        # can be injected via plan notes or a separate replay script
        result = await ssh.run("uname -a && uptime")
        return result.stdout or "sandbox-ready"

    def _determine_outcome(self, artifact: VerificationArtifact) -> VerificationOutcome:
        if not artifact.check_results:
            return VerificationOutcome.INCONCLUSIVE
        failed = [c for c in artifact.check_results if not c.passed]
        if not failed:
            return VerificationOutcome.PASSED
        if len(failed) == len(artifact.check_results):
            return VerificationOutcome.FAILED
        return VerificationOutcome.INCONCLUSIVE
