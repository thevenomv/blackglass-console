"""Tests for Pydantic model validation — agent outputs and domain models."""

from __future__ import annotations

import pytest

from app.agent.models import RawCommandOutput, RawPlanOutput
from app.domain.drift_event import DriftEventInput, DriftFinding, HostContext
from app.domain.enums import DriftCategory, DriftSeverity
from app.domain.remediation_plan import RemediationCommand


def test_drift_finding_valid() -> None:
    f = DriftFinding(
        id="f-001",
        category=DriftCategory.PACKAGES,
        severity=DriftSeverity.MEDIUM,
        title="Test finding",
        rationale="Test rationale",
    )
    assert f.category == DriftCategory.PACKAGES


def test_drift_event_primary_severity_highest() -> None:
    """primary_severity should return the most severe finding."""
    event = DriftEventInput(
        scan_id="scan-x",
        tenant_id="tenant-x",
        host_context=HostContext(
            host_id="h1",
            hostname="h1",
            scan_timestamp="2026-01-01T00:00:00Z",
        ),
        findings=[
            DriftFinding(id="1", category=DriftCategory.PACKAGES, severity=DriftSeverity.LOW, title="low", rationale=""),
            DriftFinding(id="2", category=DriftCategory.NETWORK_EXPOSURE, severity=DriftSeverity.HIGH, title="high", rationale=""),
            DriftFinding(id="3", category=DriftCategory.FIREWALL, severity=DriftSeverity.MEDIUM, title="med", rationale=""),
        ],
    )
    assert event.primary_severity == DriftSeverity.HIGH


def test_drift_event_empty_tenant_raises() -> None:
    with pytest.raises(ValueError, match="tenant_id"):
        DriftEventInput(
            scan_id="scan-x",
            tenant_id="  ",
            host_context=HostContext(
                host_id="h1",
                hostname="h1",
                scan_timestamp="2026-01-01T00:00:00Z",
            ),
            findings=[
                DriftFinding(id="1", category=DriftCategory.PACKAGES, severity=DriftSeverity.LOW, title="t", rationale="r")
            ],
        )


def test_remediation_command_empty_command_raises() -> None:
    with pytest.raises(ValueError, match="command"):
        RemediationCommand(
            id="cmd-01",
            command="   ",
            purpose="test",
            expected_effect="test",
        )


def test_raw_plan_output_defaults() -> None:
    plan = RawPlanOutput(summary="Fix the thing")
    assert plan.requires_human_approval is True
    assert plan.confidence_score >= 0.0
    assert plan.confidence_score <= 1.0


def test_raw_command_output_validation() -> None:
    cmd = RawCommandOutput(command="apt-get remove -y netcat", purpose="Remove package")
    assert cmd.destructive is False
    assert cmd.requires_root is True
