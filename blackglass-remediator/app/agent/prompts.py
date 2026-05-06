"""
Remediation agent prompts — all prompt templates in one module.

Keep prompts versioned. Any change should bump PROMPT_VERSION.
"""

from __future__ import annotations

from app.domain.enums import DriftCategory, RiskPolicyTier

PROMPT_VERSION = "v1"

SYSTEM_PROMPT = """\
You are a Linux security remediation assistant for BLACKGLASS, a configuration-integrity SaaS platform.

Your job is to analyse detected configuration drift on Linux hosts and produce a structured, explainable remediation plan.

CRITICAL RULES — you MUST follow these without exception:
1. You are generating a PROPOSAL for human review. You are NOT executing anything.
2. Every command you suggest will be reviewed by a security operator before execution.
3. You MUST output valid JSON matching the RemediationPlan schema. No free-form text outside the JSON.
4. You MUST NOT suggest commands that:
   - Wipe disks (dd, mkfs, rm -rf /)
   - Disable SSH access without scoped conditions
   - Reset firewalls broadly (iptables -F, ufw disable)
   - Modify users/groups without explicit policy justification
   - Fetch and execute remote scripts (curl|bash, wget|sh)
   - Use chmod -R 777 on directories
5. Be conservative. If you are uncertain, lower the confidence_score and recommend manual review.
6. Every command must have a clear purpose, expected_effect, and risk_level.
7. Provide rollback steps for every command that modifies state.
8. Root cause hypotheses should be concrete, not generic.

Your output will be validated against the RemediationPlan Pydantic schema.
If you cannot generate a safe, high-confidence plan, set requires_human_approval=true and explain in notes.
"""


def build_planning_prompt(
    category: str,
    severity: str,
    distro: str,
    kernel: str,
    hostname: str,
    policy_tier: RiskPolicyTier,
    allowed_commands: list[str],
    findings_summary: str,
    baseline_summary: str | None,
    current_summary: str | None,
    raw_diff: str | None,
) -> str:
    """Build the user-turn prompt for the planning agent."""
    allowed_str = "\n".join(f"  - {c}" for c in allowed_commands)

    diff_section = ""
    if raw_diff:
        diff_section = f"\n## Raw Diff\n```\n{raw_diff[:3000]}\n```"

    baseline_section = ""
    if baseline_summary:
        baseline_section = f"\n## Baseline State\n{baseline_summary[:1000]}"

    current_section = ""
    if current_summary:
        current_section = f"\n## Current (Drifted) State\n{current_summary[:1000]}"

    return f"""\
## Drift Event Details

- **Drift Category**: {category}
- **Severity**: {severity}
- **Risk Policy Tier**: {policy_tier}
- **Host**: {hostname}
- **OS / Distro**: {distro}
- **Kernel**: {kernel}

## Findings
{findings_summary}
{baseline_section}
{current_section}
{diff_section}

## Constraints
**Allowed command types for this policy tier**:
{allowed_str}

**You MUST NOT** generate commands matching the forbidden pattern list in your system prompt.

## Required Output
Respond with ONLY a JSON object matching this schema:

```json
{{
  "plan_id": "<generate a unique short ID like plan-XXXXXXXX>",
  "drift_event_scan_id": "<will be filled in>",
  "summary": "<plain English summary of what needs to be done>",
  "root_cause_hypothesis": "<concrete hypothesis about why this drift occurred>",
  "risk_reasoning": "<your reasoning about risks and tradeoffs>",
  "commands": [
    {{
      "id": "cmd-01",
      "command": "<exact shell command>",
      "purpose": "<why this command is needed>",
      "risk_level": "low|medium|high|critical",
      "expected_effect": "<observable outcome>",
      "destructive": false,
      "requires_root": true,
      "rollback_command": "<command to undo this, or null>"
    }}
  ],
  "verification_steps": [
    {{
      "id": "chk-01",
      "description": "<what we are verifying>",
      "command": "<shell command to verify>",
      "expected_output_contains": "<substring or null>",
      "expected_exit_code": 0
    }}
  ],
  "rollback_steps": [
    {{
      "order": 1,
      "description": "<rollback step>",
      "command": "<command>"
    }}
  ],
  "risk_policy_tier": "{policy_tier}",
  "confidence_score": 0.0,
  "requires_human_approval": true,
  "notes": "<any additional context for the operator or null>",
  "model_name": "auto",
  "prompt_version": "{PROMPT_VERSION}"
}}
```

For **{policy_tier}** tier:
{"- You may generate executable commands." if policy_tier != RiskPolicyTier.SAFE_GUIDANCE_ONLY else "- Do NOT generate executable commands. Provide guidance only. Leave commands as an empty array."}
{"- Confidence score should reflect sandbox verification result (to be filled post-verification)." if policy_tier == RiskPolicyTier.SANDBOX_VERIFIABLE else ""}
- Always set requires_human_approval=true.
- confidence_score range: 0.0 (no confidence) to 1.0 (high confidence).
"""


def get_drift_category_guidance(category: DriftCategory) -> str:
    """Return category-specific remediation guidance context."""
    guidance: dict[DriftCategory, str] = {
        DriftCategory.NETWORK_EXPOSURE: (
            "Unexpected network listeners may indicate backdoors, misconfigured services, or "
            "unauthorized software. Focus on identifying the process, its origin, and whether "
            "it should exist. Commands: ss -tlnp, lsof -i, systemctl status."
        ),
        DriftCategory.PACKAGES: (
            "Package drift typically means unauthorized installs, version changes, or removals. "
            "Verify package signatures and check install timestamps. "
            "Commands: dpkg -l, apt-get --dry-run, rpm -Va."
        ),
        DriftCategory.SSH: (
            "SSH configuration drift is high-risk. Changes to sshd_config can enable "
            "unauthorized access vectors. Carefully review PermitRootLogin, "
            "PasswordAuthentication, AllowUsers/AllowGroups. Always test config before restart."
        ),
        DriftCategory.AUTHORIZED_KEYS: (
            "Unauthorized authorized_keys entries are a critical persistence vector. "
            "Audit every key entry. Document any legitimate additions. "
            "Removal of unknown keys should be verified carefully."
        ),
        DriftCategory.PRIVILEGE_ESCALATION: (
            "SUID/SGID binary drift, sudo rule changes, or capability drift. "
            "These are high-priority persistence and escalation vectors. "
            "Compare checksums against known-good baselines."
        ),
        DriftCategory.FIREWALL: (
            "Firewall rule drift can expose or over-restrict services. "
            "Audit all rule changes against the security policy. "
            "Never suggest broad disables — prefer targeted rule adjustments."
        ),
        DriftCategory.IDENTITY: (
            "User/group account drift may indicate unauthorized account creation or "
            "privilege escalation. Check /etc/passwd, /etc/shadow, /etc/group diffs carefully."
        ),
        DriftCategory.PERSISTENCE: (
            "Persistence mechanism drift (cron, rc.local, init scripts) often indicates "
            "malware or unauthorized automation. Identify the trigger and payload."
        ),
        DriftCategory.SYSTEMD: (
            "Systemd unit drift can enable persistence or expose services. "
            "Check for new units, changed ExecStart paths, or new WantedBy targets."
        ),
        DriftCategory.KERNEL: (
            "Kernel-level drift is highly dangerous and complex. "
            "No automated remediation is safe. Manual expert review required."
        ),
        DriftCategory.OTHER: (
            "General drift — classify carefully before proposing remediation. "
            "Err on the side of guidance-only."
        ),
    }
    return guidance.get(category, guidance[DriftCategory.OTHER])
