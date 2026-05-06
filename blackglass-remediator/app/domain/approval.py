"""Approval domain model — human-in-the-loop approval workflow."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.domain.enums import ApprovalStatus


class ApprovalRecord(BaseModel):
    """
    Records a human approval or rejection of a remediation recommendation.

    The actor must be a real operator — no automated approvals are permitted.
    """

    approval_id: str
    recommendation_id: str
    tenant_id: str

    status: ApprovalStatus

    # Actor identity
    actor_id: str = Field(description="Operator user ID (e.g. Clerk user ID)")
    actor_email: str | None = Field(default=None)
    actor_name: str | None = Field(default=None)

    # Decision metadata
    reason: str | None = Field(default=None, description="Operator's stated reason")
    ip_address: str | None = Field(default=None)
    user_agent: str | None = Field(default=None)

    # Timestamps
    decided_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime | None = Field(
        default=None, description="When this approval expires if not acted on"
    )

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
