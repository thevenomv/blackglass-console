"""
Pydantic models for agent inputs and raw LLM output.

These are separate from domain models — they represent
the agent's internal I/O before business logic validation.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.enums import CommandRiskLevel, RiskPolicyTier, VerificationOutcome


class AgentInput(BaseModel):
    """Structured input passed to the remediation agent."""

    category: str
    severity: str
    distro: str
    kernel: str
    hostname: str
    policy_tier: RiskPolicyTier
    allowed_commands: list[str]
    findings_summary: str
    baseline_summary: str | None = None
    current_summary: str | None = None
    raw_diff: str | None = None
    scan_id: str = ""


class RawCommandOutput(BaseModel):
    """Raw command as emitted by the LLM — validated before use."""

    id: str = Field(default="cmd-01")
    command: str
    purpose: str = Field(default="")
    risk_level: CommandRiskLevel = Field(default=CommandRiskLevel.MEDIUM)
    expected_effect: str = Field(default="")
    destructive: bool = Field(default=False)
    requires_root: bool = Field(default=True)
    rollback_command: str | None = Field(default=None)


class RawVerificationCheckOutput(BaseModel):
    id: str = Field(default="chk-01")
    description: str = Field(default="")
    command: str
    expected_output_contains: str | None = Field(default=None)
    expected_exit_code: int = Field(default=0)


class RawRollbackStepOutput(BaseModel):
    order: int = Field(default=1)
    description: str = Field(default="")
    command: str


class RawPlanOutput(BaseModel):
    """Raw plan as emitted by the LLM — maps to RemediationPlan after validation."""

    plan_id: str = Field(default="")
    drift_event_scan_id: str = Field(default="")
    summary: str
    root_cause_hypothesis: str = Field(default="")
    risk_reasoning: str = Field(default="")
    commands: list[RawCommandOutput] = Field(default_factory=list)
    verification_steps: list[RawVerificationCheckOutput] = Field(default_factory=list)
    rollback_steps: list[RawRollbackStepOutput] = Field(default_factory=list)
    risk_policy_tier: str = Field(default="safe_guidance_only")
    confidence_score: float = Field(default=0.3, ge=0.0, le=1.0)
    requires_human_approval: bool = Field(default=True)
    notes: str | None = Field(default=None)
    model_name: str = Field(default="unknown")
    prompt_version: str = Field(default="v1")
