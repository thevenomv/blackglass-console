"""Drift event domain model — strongly typed input from BLACKGLASS."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.domain.enums import DriftCategory, DriftSeverity


class DriftFinding(BaseModel):
    """A single finding within a drift event payload."""

    id: str = Field(description="Unique finding ID from BLACKGLASS")
    category: DriftCategory
    severity: DriftSeverity
    title: str = Field(min_length=1, max_length=500)
    rationale: str = Field(default="", description="Analyst rationale from BLACKGLASS")


class HostContext(BaseModel):
    """Contextual information about the host where drift was detected."""

    host_id: str = Field(description="BLACKGLASS host identifier")
    hostname: str = Field(description="Display name / FQDN of the host")
    distro: str = Field(default="unknown", description="Linux distribution (e.g. ubuntu-22.04)")
    kernel: str = Field(default="unknown", description="Kernel version string")
    arch: str = Field(default="x86_64")
    scan_timestamp: datetime = Field(description="When the scan that produced this event ran")
    metadata: dict[str, Any] = Field(default_factory=dict)


class DriftEventInput(BaseModel):
    """
    Canonical typed input model for a drift event received from BLACKGLASS.

    This is the primary boundary model at the webhook ingestion layer.
    All fields are validated before any downstream processing.
    """

    event: str = Field(default="drift.detected")
    scan_id: str = Field(description="BLACKGLASS scan identifier")
    tenant_id: str = Field(description="Tenant UUID — all records are scoped to this")
    workspace_id: str | None = Field(default=None, description="Optional workspace scoping")
    host_context: HostContext
    findings: list[DriftFinding] = Field(min_length=1, description="At least one finding required")
    baseline_summary: str | None = Field(
        default=None, description="Snapshot of the stored baseline state"
    )
    current_summary: str | None = Field(
        default=None, description="Snapshot of the current (drifted) state"
    )
    raw_diff: dict[str, Any] | None = Field(
        default=None, description="Raw diff payload from drift engine"
    )

    @field_validator("tenant_id")
    @classmethod
    def validate_tenant_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("tenant_id must not be empty")
        return v

    @property
    def primary_severity(self) -> DriftSeverity:
        """Return the highest severity across all findings."""
        order = {DriftSeverity.HIGH: 0, DriftSeverity.MEDIUM: 1, DriftSeverity.LOW: 2}
        return min(self.findings, key=lambda f: order[f.severity]).severity

    @property
    def primary_category(self) -> DriftCategory:
        """Return the most critical category by ordering."""
        priority = [
            DriftCategory.PRIVILEGE_ESCALATION,
            DriftCategory.SSH,
            DriftCategory.AUTHORIZED_KEYS,
            DriftCategory.NETWORK_EXPOSURE,
            DriftCategory.IDENTITY,
            DriftCategory.FIREWALL,
            DriftCategory.PERSISTENCE,
            DriftCategory.SYSTEMD,
            DriftCategory.CRON,
            DriftCategory.KERNEL,
            DriftCategory.PACKAGES,
            DriftCategory.FILESYSTEM,
            DriftCategory.OTHER,
        ]
        for cat in priority:
            if any(f.category == cat for f in self.findings):
                return cat
        return self.findings[0].category
