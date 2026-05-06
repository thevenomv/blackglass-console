"""
Risk policy classification — determines what level of automation is permitted.

This is APPLICATION LOGIC, not prompt text.
Safety classifications must be enforced in code, not delegated to the LLM.
"""

from __future__ import annotations

from app.domain.enums import DriftCategory, DriftSeverity, RiskPolicyTier

# ---------------------------------------------------------------------------
# Forbidden pattern registry
# ---------------------------------------------------------------------------

FORBIDDEN_COMMAND_PATTERNS: list[str] = [
    "rm -rf /",
    "rm -rf /*",
    "dd if=/dev/",
    "mkfs.",
    "> /dev/sda",
    "curl | bash",
    "curl | sh",
    "wget | bash",
    "wget | sh",
    "bash <(",
    "sh <(",
    "chmod -R 777 /",
    "chmod -R 777 /*",
    "iptables -F",
    "ufw disable",
    "ufw reset",
    "userdel root",
    "passwd root",
    "chsh root",
    "chsh -s /bin/bash root",
    "echo '' > /etc/sudoers",
    "> /etc/sudoers",
    "truncate /etc/sudoers",
    "pkill -9 sshd",
    "kill -9 $(pgrep sshd)",
    "systemctl stop sshd",
    "service ssh stop",
    "setenforce 0",
    "echo 0 > /proc/sys/kernel/nmi_watchdog",
]

# Categories that always require explicit human approval regardless of severity
ALWAYS_APPROVAL_REQUIRED: frozenset[DriftCategory] = frozenset(
    [
        DriftCategory.SSH,
        DriftCategory.AUTHORIZED_KEYS,
        DriftCategory.PRIVILEGE_ESCALATION,
        DriftCategory.IDENTITY,
        DriftCategory.KERNEL,
    ]
)

# Categories that are manual-only — too ambiguous for any automation
MANUAL_ONLY_CATEGORIES: frozenset[DriftCategory] = frozenset(
    [
        DriftCategory.KERNEL,
    ]
)

# Categories safe to attempt sandbox verification
SANDBOX_VERIFIABLE_CATEGORIES: frozenset[DriftCategory] = frozenset(
    [
        DriftCategory.PACKAGES,
        DriftCategory.FILESYSTEM,
        DriftCategory.SYSTEMD,
        DriftCategory.CRON,
        DriftCategory.FIREWALL,
        DriftCategory.NETWORK_EXPOSURE,
    ]
)


def classify_policy_tier(
    category: DriftCategory,
    severity: DriftSeverity,
) -> RiskPolicyTier:
    """
    Classify a drift event into a risk policy tier.

    Rules are evaluated in priority order — more restrictive wins.
    This function is the authoritative gatekeeper for automation level.
    """
    # 1. Manual-only: too dangerous/complex for any automation
    if category in MANUAL_ONLY_CATEGORIES:
        return RiskPolicyTier.MANUAL_ONLY

    # 2. High-severity identity/auth/privilege events: approval required
    if category in ALWAYS_APPROVAL_REQUIRED:
        return RiskPolicyTier.APPROVAL_REQUIRED

    # 3. Any HIGH severity finding: always requires approval
    if severity == DriftSeverity.HIGH:
        return RiskPolicyTier.APPROVAL_REQUIRED

    # 4. Medium-severity in sandboxable categories: can verify first
    if severity == DriftSeverity.MEDIUM and category in SANDBOX_VERIFIABLE_CATEGORIES:
        return RiskPolicyTier.SANDBOX_VERIFIABLE

    # 5. Low-severity sandboxable: verify then still require approval
    if severity == DriftSeverity.LOW and category in SANDBOX_VERIFIABLE_CATEGORIES:
        return RiskPolicyTier.SANDBOX_VERIFIABLE

    # Default: guidance only — safe fallback
    return RiskPolicyTier.SAFE_GUIDANCE_ONLY


def is_command_forbidden(command: str) -> tuple[bool, str | None]:
    """
    Check whether a command string matches any forbidden pattern.

    Returns (is_forbidden, matched_pattern).
    Called on every agent-generated command before surfacing to operator.
    """
    cmd_lower = command.lower().strip()
    for pattern in FORBIDDEN_COMMAND_PATTERNS:
        if pattern.lower() in cmd_lower:
            return True, pattern
    return False, None


def get_allowed_commands_for_policy(tier: RiskPolicyTier) -> list[str]:
    """Return guidance on which command types are allowed for this tier."""
    base = [
        "Read-only inspection commands (cat, grep, ls, stat, systemctl status, etc.)",
        "Package query commands (dpkg -l, rpm -qa, apt list, etc.)",
    ]

    if tier == RiskPolicyTier.SAFE_GUIDANCE_ONLY:
        return base

    if tier == RiskPolicyTier.SANDBOX_VERIFIABLE:
        return base + [
            "Package install/remove (apt-get, yum, dnf) — with specific package names only",
            "File permission changes (chmod) — specific paths only, no recursive",
            "Service enable/disable (systemctl) — specific named services only",
            "Firewall rule adjustments (ufw allow/deny) — specific ports only",
            "File content edits (sed, tee) — specific files with narrow patterns",
        ]

    if tier == RiskPolicyTier.APPROVAL_REQUIRED:
        return base + [
            "All commands listed for sandbox_verifiable tier",
            "SSH configuration changes — sshd_config only, specific directives",
            "User/group modifications — if and only if explicitly required by the drift",
            "Sudo configuration — sudoers.d entries only, not full /etc/sudoers",
        ]

    return base  # MANUAL_ONLY — no executable commands permitted
