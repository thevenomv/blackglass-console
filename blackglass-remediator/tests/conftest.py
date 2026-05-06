"""Shared test fixtures and utilities."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.domain.drift_event import DriftEventInput, DriftFinding, HostContext
from app.domain.enums import DriftCategory, DriftSeverity, RecommendationStatus, RiskPolicyTier
from app.domain.recommendation import RemediationRecommendation
from app.domain.remediation_plan import RemediationCommand, RemediationPlan, RollbackStep, VerificationCheck
from app.infra.db.models import Base, get_session_factory
from app.main import create_app


# ---------------------------------------------------------------------------
# In-memory SQLite engine for tests
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ---------------------------------------------------------------------------
# Domain fixtures
# ---------------------------------------------------------------------------


def make_host_context(**kwargs) -> HostContext:
    defaults = dict(
        host_id="host-01",
        hostname="test-host.example.com",
        distro="ubuntu-22.04",
        kernel="5.15.0-91-generic",
        scan_timestamp=datetime(2026, 5, 1, 10, 0, 0, tzinfo=timezone.utc),
    )
    defaults.update(kwargs)
    return HostContext(**defaults)


def make_drift_finding(**kwargs) -> DriftFinding:
    defaults = dict(
        id="finding-001",
        category=DriftCategory.PACKAGES,
        severity=DriftSeverity.MEDIUM,
        title="Unexpected package installed",
        rationale="Package netcat-traditional was installed without change record",
    )
    defaults.update(kwargs)
    return DriftFinding(**defaults)


def make_drift_event(**kwargs) -> DriftEventInput:
    defaults = dict(
        event="drift.detected",
        scan_id="scan-aabbcc",
        tenant_id="tenant-00000000",
        host_context=make_host_context(),
        findings=[make_drift_finding()],
    )
    defaults.update(kwargs)
    return DriftEventInput(**defaults)


def make_remediation_command(**kwargs) -> RemediationCommand:
    defaults = dict(
        id="cmd-01",
        command="apt-get remove -y netcat-traditional",
        purpose="Remove unauthorized package",
        risk_level="medium",
        expected_effect="Package removed from system",
        destructive=False,
        requires_root=True,
        rollback_command="apt-get install -y netcat-traditional",
    )
    defaults.update(kwargs)
    return RemediationCommand(**defaults)


def make_plan(**kwargs) -> RemediationPlan:
    defaults = dict(
        plan_id="plan-TEST001",
        drift_event_scan_id="scan-aabbcc",
        summary="Remove unauthorized netcat package",
        root_cause_hypothesis="Unauthorized package installed via interactive session",
        risk_reasoning="Package netcat-traditional can be used for reverse shells",
        commands=[make_remediation_command()],
        verification_steps=[
            VerificationCheck(
                id="chk-01",
                description="Verify package removed",
                command="dpkg -l netcat-traditional",
                expected_output_contains=None,
                expected_exit_code=1,
            )
        ],
        rollback_steps=[
            RollbackStep(
                order=1,
                description="Re-install if needed",
                command="apt-get install -y netcat-traditional",
            )
        ],
        risk_policy_tier=RiskPolicyTier.SANDBOX_VERIFIABLE,
        confidence_score=0.75,
        requires_human_approval=True,
        model_name="llama3.2:3b",
        prompt_version="v1",
    )
    defaults.update(kwargs)
    return RemediationPlan(**defaults)


def make_recommendation(**kwargs) -> RemediationRecommendation:
    defaults = dict(
        id="01HZ000000000000000000000A",
        tenant_id="tenant-00000000",
        drift_event=make_drift_event(),
        risk_policy_tier=RiskPolicyTier.SANDBOX_VERIFIABLE,
        status=RecommendationStatus.AWAITING_APPROVAL,
        plan=make_plan(),
    )
    defaults.update(kwargs)
    return RemediationRecommendation(**defaults)


# ---------------------------------------------------------------------------
# HTTP test client
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="function")
async def test_client(db_session: AsyncSession) -> AsyncClient:
    from app.api.dependencies import get_db_session

    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client
