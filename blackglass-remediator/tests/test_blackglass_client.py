"""Tests for BLACKGLASS client callback behavior."""

from __future__ import annotations

import pytest
import respx
from httpx import Response

from app.domain.enums import RecommendationStatus
from app.services.blackglass_client import BlackglassClient


@pytest.mark.asyncio
@respx.mock
async def test_post_remediation_status_success() -> None:
    """Successful callback posts correct payload."""
    route = respx.post("http://bg-test/api/v1/remediations/callback").mock(
        return_value=Response(200)
    )
    client = BlackglassClient(
        base_url="http://bg-test",
        api_token="token-test",
    )
    await client.post_remediation_status(
        tenant_id="tenant-abc",
        recommendation_id="rec-001",
        status=RecommendationStatus.AWAITING_APPROVAL,
        summary="Fix the thing",
        confidence_score=0.8,
    )
    await client.aclose()
    assert route.called


@pytest.mark.asyncio
@respx.mock
async def test_post_remediation_status_404_does_not_raise() -> None:
    """404 from BLACKGLASS is logged but does not raise."""
    respx.post("http://bg-test/api/v1/remediations/callback").mock(
        return_value=Response(404)
    )
    client = BlackglassClient(base_url="http://bg-test", api_token="token-test")
    # Should not raise
    await client.post_remediation_status(
        tenant_id="t",
        recommendation_id="r",
        status=RecommendationStatus.FAILED,
    )
    await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_post_approval_status() -> None:
    route = respx.post("http://bg-test/api/v1/remediations/approval-callback").mock(
        return_value=Response(200)
    )
    client = BlackglassClient(base_url="http://bg-test", api_token="token-test")
    await client.post_approval_status(
        tenant_id="t",
        recommendation_id="r",
        approved=True,
        actor_id="user-x",
        reason="Looks good",
    )
    await client.aclose()
    assert route.called
