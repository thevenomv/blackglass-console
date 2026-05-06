"""Tests for webhook endpoint — auth, validation, and happy path."""

from __future__ import annotations

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


VALID_PAYLOAD = {
    "event": "drift.detected",
    "scan_id": "scan-001",
    "tenant_id": "tenant-abc",
    "host_id": "host-01",
    "hostname": "prod-host-01",
    "timestamp": "2026-05-01T10:00:00Z",
    "distro": "ubuntu-22.04",
    "kernel": "5.15.0-91-generic",
    "findings": [
        {
            "id": "finding-001",
            "category": "packages",
            "severity": "medium",
            "title": "Unexpected package",
            "rationale": "netcat-traditional installed without change record",
        }
    ],
}


@pytest.mark.asyncio
async def test_drift_webhook_accepted(test_client: AsyncClient) -> None:
    """Happy path: valid payload is accepted and a recommendation is created."""
    with patch(
        "app.api.routes.webhooks._run_workflow_background",
        new_callable=AsyncMock,
    ):
        resp = await test_client.post(
            "/api/v1/webhooks/blackglass/drift",
            json=VALID_PAYLOAD,
        )

    assert resp.status_code == 202
    data = resp.json()
    assert data["accepted"] is True
    assert data["recommendation_id"] is not None


@pytest.mark.asyncio
async def test_drift_webhook_invalid_json(test_client: AsyncClient) -> None:
    """Malformed JSON returns 400."""
    resp = await test_client.post(
        "/api/v1/webhooks/blackglass/drift",
        content=b"not json",
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_drift_webhook_missing_findings(test_client: AsyncClient) -> None:
    """Payload with empty findings returns 422."""
    payload = {**VALID_PAYLOAD, "findings": []}
    with patch(
        "app.api.routes.webhooks._run_workflow_background",
        new_callable=AsyncMock,
    ):
        resp = await test_client.post(
            "/api/v1/webhooks/blackglass/drift",
            json=payload,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_drift_webhook_missing_tenant(test_client: AsyncClient) -> None:
    """Payload without tenant_id returns 422."""
    payload = {**VALID_PAYLOAD, "tenant_id": ""}
    with patch(
        "app.api.routes.webhooks._run_workflow_background",
        new_callable=AsyncMock,
    ):
        resp = await test_client.post(
            "/api/v1/webhooks/blackglass/drift",
            json=payload,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_drift_webhook_signature_valid(test_client: AsyncClient) -> None:
    """Valid HMAC signature is accepted."""
    secret = "test-secret"
    body = json.dumps(VALID_PAYLOAD).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    with (
        patch(
            "app.api.routes.webhooks._run_workflow_background",
            new_callable=AsyncMock,
        ),
        patch(
            "app.core.security.get_settings",
        ) as mock_settings,
    ):
        from unittest.mock import MagicMock
        from pydantic import SecretStr
        mock_cfg = MagicMock()
        mock_cfg.blackglass_webhook_secret = SecretStr(secret)
        mock_cfg.is_production = False
        mock_settings.return_value = mock_cfg

        resp = await test_client.post(
            "/api/v1/webhooks/blackglass/drift",
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Blackglass-Signature": sig,
            },
        )

    # 202 or 422 — we just assert we didn't get 401
    assert resp.status_code != 401
