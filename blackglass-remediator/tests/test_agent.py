"""Tests for the agent — forbidden commands, guidance-only plan, output parsing."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.agent.models import AgentInput
from app.agent.remediation_agent import AgentError, RemediationAgent
from app.domain.enums import RiskPolicyTier
from tests.conftest import make_drift_event


def _make_agent_input(tier: RiskPolicyTier = RiskPolicyTier.SANDBOX_VERIFIABLE) -> AgentInput:
    event = make_drift_event()
    return AgentInput(
        category="packages",
        severity="medium",
        distro="ubuntu-22.04",
        kernel="5.15.0",
        hostname="test-host",
        policy_tier=tier,
        allowed_commands=["apt-get remove <package>"],
        findings_summary="[MEDIUM] Unexpected package (packages): netcat installed",
        scan_id="scan-test",
    )


@pytest.mark.asyncio
async def test_agent_strips_forbidden_commands() -> None:
    """Agent must strip commands matching the forbidden pattern list."""
    # Mock LLM returning a plan with a forbidden command
    bad_plan = {
        "plan_id": "plan-x",
        "drift_event_scan_id": "scan-test",
        "summary": "Fix it",
        "root_cause_hypothesis": "bad thing",
        "risk_reasoning": "risky",
        "commands": [
            {
                "id": "cmd-01",
                "command": "rm -rf /",
                "purpose": "Clean up",
                "risk_level": "critical",
                "expected_effect": "deletes everything",
                "destructive": True,
                "requires_root": True,
                "rollback_command": None,
            }
        ],
        "verification_steps": [],
        "rollback_steps": [],
        "risk_policy_tier": "sandbox_verifiable",
        "confidence_score": 0.5,
        "requires_human_approval": True,
        "notes": None,
        "model_name": "test",
        "prompt_version": "v1",
    }

    agent = RemediationAgent()
    with patch.object(agent, "_call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = json.dumps(bad_plan)
        plan = await agent.plan(_make_agent_input())

    # The forbidden rm -rf / must be stripped
    assert len(plan.commands) == 0


@pytest.mark.asyncio
async def test_agent_safe_guidance_only_strips_all_commands() -> None:
    """For SAFE_GUIDANCE_ONLY tier, all commands must be stripped even if LLM generates them."""
    valid_plan = {
        "plan_id": "plan-x",
        "drift_event_scan_id": "scan-test",
        "summary": "Guidance: check the package",
        "root_cause_hypothesis": "Unauthorized install",
        "risk_reasoning": "Low risk",
        "commands": [
            {
                "id": "cmd-01",
                "command": "apt-get remove -y netcat",
                "purpose": "Remove package",
                "risk_level": "medium",
                "expected_effect": "Package removed",
                "destructive": False,
                "requires_root": True,
                "rollback_command": None,
            }
        ],
        "verification_steps": [],
        "rollback_steps": [],
        "risk_policy_tier": "safe_guidance_only",
        "confidence_score": 0.6,
        "requires_human_approval": True,
        "notes": None,
        "model_name": "test",
        "prompt_version": "v1",
    }

    agent = RemediationAgent()
    with patch.object(agent, "_call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = json.dumps(valid_plan)
        plan = await agent.plan(_make_agent_input(tier=RiskPolicyTier.SAFE_GUIDANCE_ONLY))

    # All commands stripped for guidance-only
    assert len(plan.commands) == 0


@pytest.mark.asyncio
async def test_agent_invalid_json_raises() -> None:
    """Invalid JSON from LLM raises AgentError."""
    agent = RemediationAgent()
    with patch.object(agent, "_call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = "this is not json at all"
        with pytest.raises(AgentError, match="valid JSON"):
            await agent.plan(_make_agent_input())


@pytest.mark.asyncio
async def test_agent_always_sets_requires_human_approval() -> None:
    """requires_human_approval must always be True regardless of LLM output."""
    valid_plan = {
        "plan_id": "plan-x",
        "drift_event_scan_id": "scan-test",
        "summary": "Fix it",
        "root_cause_hypothesis": "bad",
        "risk_reasoning": "ok",
        "commands": [
            {
                "id": "cmd-01",
                "command": "apt-get remove -y netcat",
                "purpose": "Remove",
                "risk_level": "low",
                "expected_effect": "removed",
                "destructive": False,
                "requires_root": True,
                "rollback_command": None,
            }
        ],
        "verification_steps": [],
        "rollback_steps": [],
        "risk_policy_tier": "sandbox_verifiable",
        "confidence_score": 0.9,
        "requires_human_approval": False,  # LLM tries to set this false
        "notes": None,
        "model_name": "test",
        "prompt_version": "v1",
    }

    agent = RemediationAgent()
    with patch.object(agent, "_call_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = json.dumps(valid_plan)
        plan = await agent.plan(_make_agent_input())

    # Must always be True — agent cannot override this
    assert plan.requires_human_approval is True
