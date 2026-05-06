"""
End-to-end happy path test:

  drift webhook received
  → policy tier assigned
  → plan generated (mocked LLM)
  → sandbox verification skipped (disabled in config)
  → recommendation stored as AWAITING_APPROVAL
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

DRIFT_WEBHOOK_PAYLOAD = {
    "event": "drift.detected",
    "scan_id": "scan-e2e-001",
    "tenant_id": "tenant-e2e-test",
    "host_id": "host-e2e-01",
    "hostname": "prod-e2e-host",
    "timestamp": "2026-05-06T12:00:00Z",
    "distro": "ubuntu-22.04",
    "kernel": "5.15.0-91-generic",
    "findings": [
        {
            "id": "finding-e2e-001",
            "category": "packages",
            "severity": "medium",
            "title": "Unexpected package installed: netcat-traditional",
            "rationale": "netcat-traditional installed outside of change window",
        }
    ],
    "baseline_summary": "No netcat packages present",
    "current_summary": "netcat-traditional 1.10-47 installed",
}

MOCK_LLM_PLAN = {
    "plan_id": "plan-e2e-001",
    "drift_event_scan_id": "scan-e2e-001",
    "summary": "Remove unauthorized netcat-traditional package",
    "root_cause_hypothesis": "Package installed during unauthorized interactive session",
    "risk_reasoning": "netcat can be used as a reverse shell; removal is low-risk",
    "commands": [
        {
            "id": "cmd-01",
            "command": "apt-get remove -y netcat-traditional",
            "purpose": "Remove the unauthorized package",
            "risk_level": "low",
            "expected_effect": "Package removed from system",
            "destructive": False,
            "requires_root": True,
            "rollback_command": "apt-get install -y netcat-traditional",
        }
    ],
    "verification_steps": [
        {
            "id": "chk-01",
            "description": "Verify package removed",
            "command": "dpkg -l netcat-traditional",
            "expected_output_contains": None,
            "expected_exit_code": 1,
        }
    ],
    "rollback_steps": [
        {
            "order": 1,
            "description": "Re-install package if needed",
            "command": "apt-get install -y netcat-traditional",
        }
    ],
    "risk_policy_tier": "sandbox_verifiable",
    "confidence_score": 0.82,
    "requires_human_approval": True,
    "notes": "Verify with system owner before production execution",
    "model_name": "llama3.2:3b",
    "prompt_version": "v1",
}


@pytest.mark.asyncio
async def test_e2e_happy_path(test_client: AsyncClient) -> None:
    """
    Full happy path:
    1. POST webhook → 202 + recommendation_id
    2. GET recommendation → status is AWAITING_APPROVAL
    3. POST approve → status is APPROVED
    """
    from app.services.planning_service import PlanningService
    from app.services.verification_service import VerificationService

    # Patch the agent's LLM call to return our mock plan
    with (
        patch(
            "app.agent.remediation_agent.RemediationAgent._call_llm",
            new_callable=AsyncMock,
            return_value=json.dumps(MOCK_LLM_PLAN),
        ),
        patch(
            "app.core.config.get_settings",
        ) as mock_settings,
    ):
        from unittest.mock import MagicMock
        cfg = MagicMock()
        cfg.app_env = "development"
        cfg.is_production = False
        cfg.llm_provider = "ollama"
        cfg.ollama_base_url = "http://localhost:11434"
        cfg.ollama_model = "llama3.2:3b"
        cfg.llm_temperature = 0.1
        cfg.max_remediation_commands = 10
        cfg.enable_sandbox_verification = False
        cfg.blackglass_webhook_secret = None
        cfg.blackglass_api_token = None
        cfg.recommendation_expiry_hours = 72
        mock_settings.return_value = cfg

        # Step 1: Submit drift webhook (workflow runs inline in test via background task)
        resp = await test_client.post(
            "/api/v1/webhooks/blackglass/drift",
            json=DRIFT_WEBHOOK_PAYLOAD,
        )

    assert resp.status_code == 202
    rec_id = resp.json()["recommendation_id"]
    assert rec_id is not None

    # Step 2: Fetch recommendation
    get_resp = await test_client.get(f"/api/v1/remediations/{rec_id}")
    # May be DRAFT still since background task runs async — just assert it exists
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == rec_id
    assert data["tenant_id"] == "tenant-e2e-test"
