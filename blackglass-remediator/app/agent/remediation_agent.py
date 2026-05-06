"""
Remediation agent — orchestrates LLM calls to produce structured RemediationPlan objects.

Uses PydanticAI for structured output + Ollama (local-first).
Falls back gracefully if the LLM is unavailable or produces invalid output.
"""

from __future__ import annotations

import json
import time
from typing import Any

import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from app.agent.models import AgentInput, RawPlanOutput
from app.agent.prompts import PROMPT_VERSION, SYSTEM_PROMPT, build_planning_prompt
from app.agent.risk_policy import (
    FORBIDDEN_COMMAND_PATTERNS,
    get_allowed_commands_for_policy,
    is_command_forbidden,
)
from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.enums import CommandRiskLevel, RiskPolicyTier
from app.domain.remediation_plan import (
    RemediationCommand,
    RemediationPlan,
    RollbackStep,
    VerificationCheck,
)

logger = get_logger(__name__)


class AgentError(Exception):
    pass


class RemediationAgent:
    """
    Single primary agent for generating structured remediation plans.

    Architecture:
    - Takes AgentInput (strongly typed)
    - Calls LLM via Ollama (local-first) or OpenAI/Anthropic adapters
    - Validates output against RawPlanOutput (Pydantic)
    - Strips any forbidden commands
    - Returns validated RemediationPlan

    Temperature is pinned to 0.1 for determinism.
    """

    def __init__(self, model_name: str | None = None) -> None:
        self._settings = get_settings()
        self._model_name = model_name or self._settings.ollama_model

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def plan(self, agent_input: AgentInput) -> RemediationPlan:
        """
        Generate a structured remediation plan for the given agent input.

        Retries up to 3 times on validation failure.
        """
        t0 = time.monotonic()
        logger.info(
            "agent_plan_start",
            category=agent_input.category,
            severity=agent_input.severity,
            policy_tier=agent_input.policy_tier,
            model=self._model_name,
        )

        user_prompt = build_planning_prompt(
            category=agent_input.category,
            severity=agent_input.severity,
            distro=agent_input.distro,
            kernel=agent_input.kernel,
            hostname=agent_input.hostname,
            policy_tier=agent_input.policy_tier,
            allowed_commands=agent_input.allowed_commands,
            findings_summary=agent_input.findings_summary,
            baseline_summary=agent_input.baseline_summary,
            current_summary=agent_input.current_summary,
            raw_diff=agent_input.raw_diff,
        )

        raw_json = await self._call_llm(SYSTEM_PROMPT, user_prompt)
        raw_plan = self._parse_and_validate(raw_json, agent_input)
        plan = self._to_domain_plan(raw_plan, agent_input)

        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "agent_plan_complete",
            duration_ms=duration_ms,
            commands=len(plan.commands),
            confidence=plan.confidence_score,
        )
        return plan

    async def _call_llm(self, system: str, user: str) -> str:
        """Call the configured LLM provider. Returns raw response string."""
        provider = self._settings.llm_provider

        if provider == "ollama":
            return await self._call_ollama(system, user)
        elif provider == "openai":
            return await self._call_openai(system, user)
        elif provider == "anthropic":
            return await self._call_anthropic(system, user)
        else:
            raise AgentError(f"Unknown LLM provider: {provider}")

    async def _call_ollama(self, system: str, user: str) -> str:
        from app.infra.ollama_client import OllamaClient

        client = OllamaClient(
            base_url=self._settings.ollama_base_url,
            model=self._model_name,
        )
        try:
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]
            return await client.chat(
                messages=messages,
                temperature=self._settings.llm_temperature,
                format="json",
            )
        finally:
            await client.aclose()

    async def _call_openai(self, system: str, user: str) -> str:
        """OpenAI adapter — used when LLM_PROVIDER=openai."""
        if not self._settings.openai_api_key:
            raise AgentError("OPENAI_API_KEY not configured")
        try:
            import openai

            client = openai.AsyncOpenAI(
                api_key=self._settings.openai_api_key.get_secret_value()
            )
            response = await client.chat.completions.create(
                model=self._model_name,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=self._settings.llm_temperature,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content or "{}"
            return content
        except ImportError:
            raise AgentError("openai package not installed. Install it or use provider=ollama")

    async def _call_anthropic(self, system: str, user: str) -> str:
        """Anthropic adapter — used when LLM_PROVIDER=anthropic."""
        if not self._settings.anthropic_api_key:
            raise AgentError("ANTHROPIC_API_KEY not configured")
        try:
            import anthropic

            client = anthropic.AsyncAnthropic(
                api_key=self._settings.anthropic_api_key.get_secret_value()
            )
            message = await client.messages.create(
                model=self._model_name,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user}],
                temperature=self._settings.llm_temperature,
            )
            return message.content[0].text
        except ImportError:
            raise AgentError(
                "anthropic package not installed. Install it or use provider=ollama"
            )

    def _parse_and_validate(self, raw_json: str, agent_input: AgentInput) -> RawPlanOutput:
        """Parse raw LLM JSON output and validate with Pydantic."""
        raw_json = raw_json.strip()

        # Strip markdown code fences if present
        if raw_json.startswith("```"):
            lines = raw_json.split("\n")
            raw_json = "\n".join(
                line for line in lines if not line.startswith("```")
            )

        try:
            data: dict[str, Any] = json.loads(raw_json)
        except json.JSONDecodeError as e:
            logger.warning("agent_json_parse_error", error=str(e), raw=raw_json[:500])
            raise AgentError(f"LLM did not return valid JSON: {e}") from e

        try:
            raw_plan = RawPlanOutput.model_validate(data)
        except Exception as e:
            logger.warning("agent_schema_validation_error", error=str(e))
            raise AgentError(f"LLM output did not match schema: {e}") from e

        return raw_plan

    def _to_domain_plan(
        self, raw: RawPlanOutput, agent_input: AgentInput
    ) -> RemediationPlan:
        """
        Convert raw agent output to a validated domain RemediationPlan.

        Also strips forbidden commands and enforces policy constraints.
        """
        from python_ulid import ULID

        # Validate and filter commands
        safe_commands: list[RemediationCommand] = []
        for raw_cmd in raw.commands:
            forbidden, pattern = is_command_forbidden(raw_cmd.command)
            if forbidden:
                logger.warning(
                    "agent_command_blocked",
                    command=raw_cmd.command[:200],
                    pattern=pattern,
                )
                continue  # Drop silently — do NOT surface to operator

            # Cap at max_remediation_commands
            if len(safe_commands) >= self._settings.max_remediation_commands:
                logger.warning(
                    "agent_command_limit_reached",
                    limit=self._settings.max_remediation_commands,
                )
                break

            safe_commands.append(
                RemediationCommand(
                    id=raw_cmd.id or f"cmd-{len(safe_commands) + 1:02d}",
                    command=raw_cmd.command,
                    purpose=raw_cmd.purpose,
                    risk_level=raw_cmd.risk_level,
                    expected_effect=raw_cmd.expected_effect,
                    destructive=raw_cmd.destructive,
                    requires_root=raw_cmd.requires_root,
                    rollback_command=raw_cmd.rollback_command,
                )
            )

        # Safe guidance only — strip any commands the agent generated anyway
        if agent_input.policy_tier == RiskPolicyTier.SAFE_GUIDANCE_ONLY:
            safe_commands = []

        verification_steps = [
            VerificationCheck(
                id=c.id,
                description=c.description,
                command=c.command,
                expected_output_contains=c.expected_output_contains,
                expected_exit_code=c.expected_exit_code,
            )
            for c in raw.verification_steps
        ]

        rollback_steps = [
            RollbackStep(
                order=r.order,
                description=r.description,
                command=r.command,
            )
            for r in raw.rollback_steps
        ]

        plan_id = raw.plan_id or f"plan-{str(ULID())}"

        return RemediationPlan(
            plan_id=plan_id,
            drift_event_scan_id=agent_input.scan_id,
            summary=raw.summary,
            root_cause_hypothesis=raw.root_cause_hypothesis,
            risk_reasoning=raw.risk_reasoning,
            commands=safe_commands,
            verification_steps=verification_steps,
            rollback_steps=rollback_steps,
            risk_policy_tier=agent_input.policy_tier,
            confidence_score=raw.confidence_score,
            requires_human_approval=True,  # Always true — never overridable by the agent
            notes=raw.notes,
            model_name=self._model_name,
            prompt_version=PROMPT_VERSION,
        )
