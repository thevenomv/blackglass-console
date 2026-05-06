"""Tests for the approval workflow state machine."""

from __future__ import annotations

import pytest
import pytest_asyncio

from tests.conftest import make_recommendation
from app.domain.enums import RecommendationStatus
from app.services.approval_service import ApprovalError, ApprovalService


@pytest.mark.asyncio
async def test_approve_happy_path(db_session) -> None:
    """A recommendation in AWAITING_APPROVAL can be approved."""
    from app.infra.repositories.recommendation_repo import RecommendationRepository

    rec = make_recommendation(status=RecommendationStatus.AWAITING_APPROVAL)
    repo = RecommendationRepository(db_session)
    await repo.save(rec)
    await db_session.commit()

    svc = ApprovalService(db_session)
    updated = await svc.approve(
        rec=rec,
        actor_id="user-clerk-abc",
        actor_email="ops@example.com",
        reason="Plan verified — approved for production",
    )

    assert updated.status == RecommendationStatus.APPROVED
    assert updated.approval is not None
    assert updated.approval.actor_id == "user-clerk-abc"
    assert updated.approved_at is not None
    assert any("approved" in entry for entry in updated.audit_log)


@pytest.mark.asyncio
async def test_approve_wrong_status_raises(db_session) -> None:
    """Cannot approve a recommendation in DRAFT status."""
    rec = make_recommendation(status=RecommendationStatus.DRAFT)

    svc = ApprovalService(db_session)
    with pytest.raises(ApprovalError, match="AWAITING_APPROVAL"):
        await svc.approve(rec=rec, actor_id="user-x")


@pytest.mark.asyncio
async def test_reject_happy_path(db_session) -> None:
    """A recommendation in AWAITING_APPROVAL can be rejected."""
    from app.infra.repositories.recommendation_repo import RecommendationRepository

    rec = make_recommendation(status=RecommendationStatus.AWAITING_APPROVAL)
    repo = RecommendationRepository(db_session)
    await repo.save(rec)
    await db_session.commit()

    svc = ApprovalService(db_session)
    updated = await svc.reject(
        rec=rec,
        actor_id="user-clerk-xyz",
        reason="Risk too high — manual review required",
    )

    assert updated.status == RecommendationStatus.REJECTED
    assert updated.approval is not None
    assert any("rejected" in entry for entry in updated.audit_log)


@pytest.mark.asyncio
async def test_cannot_approve_already_approved(db_session) -> None:
    """Cannot approve an already-approved recommendation."""
    rec = make_recommendation(status=RecommendationStatus.APPROVED)

    svc = ApprovalService(db_session)
    with pytest.raises(ApprovalError):
        await svc.approve(rec=rec, actor_id="user-x")
