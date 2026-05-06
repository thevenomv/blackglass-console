"""Verification result domain model — sandbox execution artefacts."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.domain.enums import SandboxStatus, VerificationOutcome


class CommandExecutionResult(BaseModel):
    """Result of executing a single command inside the sandbox."""

    command_id: str
    command: str
    exit_code: int
    stdout: str = Field(default="")
    stderr: str = Field(default="")
    duration_seconds: float = Field(default=0.0)
    executed_at: datetime = Field(default_factory=datetime.utcnow)


class CheckResult(BaseModel):
    """Result of a single verification check."""

    check_id: str
    description: str
    command: str
    exit_code: int
    stdout: str = Field(default="")
    passed: bool
    failure_reason: str | None = Field(default=None)


class SandboxInfo(BaseModel):
    """Metadata about the ephemeral DigitalOcean droplet used for verification."""

    droplet_id: str | None = Field(default=None)
    droplet_ip: str | None = Field(default=None)
    region: str = Field(default="unknown")
    image: str = Field(default="unknown")
    size: str = Field(default="unknown")
    status: SandboxStatus = Field(default=SandboxStatus.PROVISIONING)
    provisioned_at: datetime | None = Field(default=None)
    destroyed_at: datetime | None = Field(default=None)


class VerificationArtifact(BaseModel):
    """Complete trace of a single verification run."""

    artifact_id: str
    recommendation_id: str
    sandbox_info: SandboxInfo
    drift_replay_log: str | None = Field(
        default=None, description="Output from replaying the drift state"
    )
    command_results: list[CommandExecutionResult] = Field(default_factory=list)
    check_results: list[CheckResult] = Field(default_factory=list)
    raw_output: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = Field(default=None)


class VerificationResult(BaseModel):
    """Aggregate outcome of sandbox verification for a remediation plan."""

    result_id: str
    recommendation_id: str
    outcome: VerificationOutcome
    passed_checks: int = Field(default=0)
    total_checks: int = Field(default=0)
    summary: str
    artifacts: list[VerificationArtifact] = Field(default_factory=list)
    confidence_adjustment: float = Field(
        default=0.0,
        description="Added to plan confidence: +0.2 for pass, -0.3 for fail",
    )
    verified_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def pass_rate(self) -> float:
        if self.total_checks == 0:
            return 0.0
        return self.passed_checks / self.total_checks
