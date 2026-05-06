"""
RemediationRecommendation — the top-level aggregate that ties together:
  - the originating drift event
  - the generated plan
  - the verification result
  - the approval state
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.domain.approval import ApprovalRecord
from app.domain.drift_event import DriftEventInput
from app.domain.enums import RecommendationStatus, RiskPolicyTier
from app.domain.remediation_plan import RemediationPlan
from app.domain.verification_result import VerificationResult


class RemediationRecommendation(BaseModel):
    """Top-level aggregate for a full remediation lifecycle."""

    id: str = Field(description="ULID — primary key")
    tenant_id: str
    workspace_id: str | None = Field(default=None)

    # Source event
    drift_event: DriftEventInput

    # Derived during processing
    risk_policy_tier: RiskPolicyTier | None = Field(default=None)
    plan: RemediationPlan | None = Field(default=None)
    verification_result: VerificationResult | None = Field(default=None)
    approval: ApprovalRecord | None = Field(default=None)

    status: RecommendationStatus = Field(default=RecommendationStatus.DRAFT)

    # Audit trail (append-only list of log strings)
    audit_log: list[str] = Field(default_factory=list)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    verified_at: datetime | None = Field(default=None)
    approved_at: datetime | None = Field(default=None)
    expired_at: datetime | None = Field(default=None)

    def append_audit(self, entry: str) -> None:
        ts = datetime.utcnow().isoformat()
        self.audit_log.append(f"[{ts}] {entry}")
        self.updated_at = datetime.utcnow()
