"""
Agent tool functions — called by the planning agent during reasoning.

These tools provide context to the agent without exposing production infrastructure.
SAFETY: No tool here may SSH into real customer hosts.
"""

from __future__ import annotations

from app.agent.prompts import get_drift_category_guidance
from app.agent.risk_policy import get_allowed_commands_for_policy
from app.domain.drift_event import HostContext
from app.domain.enums import DriftCategory, RiskPolicyTier


def lookup_drift_category_guidance(category: str) -> str:
    """Return domain-specific guidance for a drift category."""
    try:
        cat = DriftCategory(category)
    except ValueError:
        cat = DriftCategory.OTHER
    return get_drift_category_guidance(cat)


def get_distribution_family(host_context: HostContext) -> str:
    """
    Return the package manager family for the given host distro.
    Used to tailor command suggestions.
    """
    distro = host_context.distro.lower()
    if any(d in distro for d in ("ubuntu", "debian", "kali", "mint")):
        return "debian"
    if any(d in distro for d in ("centos", "rhel", "rocky", "almalinux", "fedora")):
        return "rhel"
    if "alpine" in distro:
        return "alpine"
    if "arch" in distro:
        return "arch"
    return "unknown"


def get_allowed_commands_for_policy_tier(policy_tier: str) -> list[str]:
    """Return the list of allowed command types for a given policy tier."""
    try:
        tier = RiskPolicyTier(policy_tier)
    except ValueError:
        tier = RiskPolicyTier.SAFE_GUIDANCE_ONLY
    return get_allowed_commands_for_policy(tier)


def get_forbidden_command_patterns() -> list[str]:
    """Return the current list of forbidden command patterns."""
    from app.agent.risk_policy import FORBIDDEN_COMMAND_PATTERNS

    return FORBIDDEN_COMMAND_PATTERNS


def suggest_verification_checks(category: str, dist_family: str) -> list[dict]:
    """
    Suggest verification check commands for a given drift category and distro.
    Returns a list of check dicts the agent can include in its plan.
    """
    checks_by_category: dict[str, list[dict]] = {
        "packages": [
            {
                "id": "chk-pkg-01",
                "description": "Verify target package state",
                "command": "dpkg -l | grep <package>" if dist_family == "debian" else "rpm -q <package>",
                "expected_output_contains": None,
                "expected_exit_code": 0,
            }
        ],
        "network_exposure": [
            {
                "id": "chk-net-01",
                "description": "Verify no unexpected listeners on target port",
                "command": "ss -tlnp | grep LISTEN",
                "expected_output_contains": None,
                "expected_exit_code": 0,
            }
        ],
        "ssh": [
            {
                "id": "chk-ssh-01",
                "description": "Verify sshd config is valid",
                "command": "sshd -t",
                "expected_output_contains": None,
                "expected_exit_code": 0,
            },
            {
                "id": "chk-ssh-02",
                "description": "Verify sshd is running",
                "command": "systemctl is-active sshd",
                "expected_output_contains": "active",
                "expected_exit_code": 0,
            },
        ],
        "firewall": [
            {
                "id": "chk-fw-01",
                "description": "Verify firewall is active",
                "command": "ufw status",
                "expected_output_contains": "active",
                "expected_exit_code": 0,
            }
        ],
        "systemd": [
            {
                "id": "chk-svc-01",
                "description": "Verify target unit state",
                "command": "systemctl is-enabled <unit>",
                "expected_output_contains": None,
                "expected_exit_code": 0,
            }
        ],
    }
    return checks_by_category.get(category, [])
