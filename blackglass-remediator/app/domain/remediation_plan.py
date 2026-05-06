"""Remediation plan domain model."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.domain.enums import CommandRiskLevel, RiskPolicyTier


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------


class RemediationCommand(BaseModel):
    """A single structured, auditable remediation command."""

    id: str = Field(description="Short unique slug, e.g. cmd-01")
    command: str = Field(min_length=1, description="The exact shell command string")
    purpose: str = Field(description="Why this command is needed")
    risk_level: CommandRiskLevel = Field(default=CommandRiskLevel.MEDIUM)
    expected_effect: str = Field(description="Observable outcome if successful")
    destructive: bool = Field(
        default=False, description="True if this command removes, disables, or overwrites data"
    )
    requires_root: bool = Field(default=True)
    rollback_command: str | None = Field(
        default=None, description="Command to undo this specific step"
    )

    @field_validator("command")
    @classmethod
    def command_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("command must not be empty or whitespace")
        return v


class VerificationCheck(BaseModel):
    """A check to run after remediation to confirm the drift has cleared."""

    id: str = Field(description="Short unique slug, e.g. chk-01")
    description: str
    command: str = Field(description="Shell command whose output we inspect")
    expected_output_contains: str | None = Field(
        default=None, description="Substring the output must contain to pass"
    )
    expected_exit_code: int = Field(default=0)


class RollbackStep(BaseModel):
    """Ordered step to reverse the remediation if something goes wrong."""

    order: int = Field(ge=1)
    description: str
    command: str


# ---------------------------------------------------------------------------
# Plan
# ---------------------------------------------------------------------------


class RemediationPlan(BaseModel):
    """
    Structured, explainable remediation plan produced by the AI agent.

    The agent MUST populate every required field.
    Free-form prose lives in summary/notes only.
    """

    plan_id: str = Field(description="Generated ULID for this specific plan")
    drift_event_scan_id: str = Field(description="Links back to the originating scan")

    # Reasoning output
    summary: str = Field(min_length=10, description="Plain-English description of the remediation")
    root_cause_hypothesis: str = Field(
        description="Agent's hypothesis about why this drift occurred"
    )
    risk_reasoning: str = Field(description="Explanation of risk factors considered")

    # Executable artefacts
    commands: list[RemediationCommand] = Field(
        min_length=0,
        description="Ordered list of remediation commands. Empty for guidance-only plans.",
    )
    verification_steps: list[VerificationCheck] = Field(default_factory=list)
    rollback_steps: list[RollbackStep] = Field(default_factory=list)

    # Safety metadata
    risk_policy_tier: RiskPolicyTier
    confidence_score: float = Field(
        ge=0.0, le=1.0, description="Agent confidence 0.0 (none) to 1.0 (high)"
    )
    requires_human_approval: bool = Field(
        default=True, description="Always true unless tier is sandbox_verifiable and verified"
    )

    notes: str | None = Field(default=None, description="Additional context for the operator")
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    model_name: str = Field(default="unknown", description="LLM model used")
    prompt_version: str = Field(default="v1")
