"""
Risk policy classification — determines what level of automation is permitted.

This is APPLICATION LOGIC, not prompt text.
Safety classifications must be enforced in code, not delegated to the LLM.

Strict tiering
--------------
When `BLACKGLASS_REMEDIATOR_STRICT_TIERING=true`, the classifier
fails CLOSED for any category not on the explicit
`KNOWN_AUTOMATABLE_CATEGORIES` list — unknowns get `MANUAL_ONLY`
instead of the historical `SAFE_GUIDANCE_ONLY` fallback. Operators
serving regulated customers should turn this on; the result is that
adding a new `DriftCategory` enum value WITHOUT teaching the policy
about it produces a manual-only recommendation instead of silently
downgrading to "I'll explain it but not generate commands". The
default is OFF for backwards-compat with existing deployments.
"""

from __future__ import annotations

import os

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

# Union of every category that the policy KNOWS about — i.e. has a
# deliberate handling rule for. Used by strict tiering to decide whether
# an unknown category should fall through to MANUAL_ONLY (fail-closed)
# vs SAFE_GUIDANCE_ONLY (the historical default). Persistence is in the
# list because it's caught by the severity-based fallthrough rules
# below; OTHER is intentionally NOT in here — it's the "unknown bucket"
# the strict mode targets.
KNOWN_AUTOMATABLE_CATEGORIES: frozenset[DriftCategory] = frozenset(
    [
        DriftCategory.NETWORK_EXPOSURE,
        DriftCategory.IDENTITY,
        DriftCategory.PERSISTENCE,
        DriftCategory.SSH,
        DriftCategory.FIREWALL,
        DriftCategory.PACKAGES,
        DriftCategory.PRIVILEGE_ESCALATION,
        DriftCategory.AUTHORIZED_KEYS,
        DriftCategory.SYSTEMD,
        DriftCategory.CRON,
        DriftCategory.KERNEL,
        DriftCategory.FILESYSTEM,
    ]
)


def strict_tiering_enabled() -> bool:
    """True when BLACKGLASS_REMEDIATOR_STRICT_TIERING is truthy."""
    raw = os.environ.get("BLACKGLASS_REMEDIATOR_STRICT_TIERING", "").strip().lower()
    return raw in {"1", "true", "yes"}


# Per-category cap on the agent's reported confidence score (0..1).
# Even when the LLM is sure of itself, anything in a category we
# don't fully trust gets its score clamped — operators see the cap in
# the UI as "Capped at 0.5 — category-policy ceiling". This is the
# product surface of the policy: a high-confidence kernel fix isn't
# automatable, period, and the score should reflect that.
CATEGORY_CONFIDENCE_CAP: dict[DriftCategory, float] = {
    DriftCategory.KERNEL: 0.30,
    DriftCategory.OTHER: 0.40,
    DriftCategory.PRIVILEGE_ESCALATION: 0.60,
    DriftCategory.AUTHORIZED_KEYS: 0.70,
    DriftCategory.IDENTITY: 0.70,
    DriftCategory.SSH: 0.85,
}


def confidence_cap_for_category(category: DriftCategory) -> float:
    """
    Maximum confidence score (0..1) we'll surface for this category,
    regardless of what the LLM reports. Anything not on the cap list
    has no per-category ceiling (only the global tier-based gates
    apply).
    """
    return CATEGORY_CONFIDENCE_CAP.get(category, 1.0)


def apply_confidence_cap(category: DriftCategory, raw_confidence: float) -> tuple[float, bool]:
    """
    Clamp the LLM's reported confidence to the category ceiling.
    Returns (effective_confidence, was_capped). The boolean lets the
    UI display "Capped at X — category-policy ceiling".
    """
    if not 0.0 <= raw_confidence <= 1.0:
        # Out-of-range scores are themselves a smell — clamp to 0 and
        # mark as capped so the operator sees something is wrong.
        return 0.0, True
    cap = confidence_cap_for_category(category)
    if raw_confidence > cap:
        return cap, True
    return raw_confidence, False


def classify_policy_tier(
    category: DriftCategory,
    severity: DriftSeverity,
) -> RiskPolicyTier:
    """
    Classify a drift event into a risk policy tier.

    Rules are evaluated in priority order — more restrictive wins.
    This function is the authoritative gatekeeper for automation level.

    When `BLACKGLASS_REMEDIATOR_STRICT_TIERING=true`, categories not in
    `KNOWN_AUTOMATABLE_CATEGORIES` (currently only `OTHER`) return
    `MANUAL_ONLY` instead of `SAFE_GUIDANCE_ONLY`. That fails closed —
    a future drift category we haven't taught the policy about will
    refuse to generate commands until someone updates this file.
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

    # 6. Strict tiering: unknown categories fail closed.
    if strict_tiering_enabled() and category not in KNOWN_AUTOMATABLE_CATEGORIES:
        return RiskPolicyTier.MANUAL_ONLY

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


# ---------------------------------------------------------------------------
# Mandatory-approval pattern detection
# ---------------------------------------------------------------------------
#
# Even when the category-based tier resolves to SANDBOX_VERIFIABLE, we
# auto-escalate to APPROVAL_REQUIRED if any command in the plan touches
# `sudo`, `systemctl stop`, `systemctl disable`, `systemctl mask`, or
# `systemctl restart sshd|ssh`. These are the patterns where a wrong
# call is significantly more destructive than the typical
# package-install / chmod sandbox-verifiable case.
#
# This sits *alongside* `is_command_forbidden` (which BLOCKS commands
# entirely) — the patterns here are commands we permit but escalate.

MANDATORY_APPROVAL_PATTERNS: tuple[str, ...] = (
    "sudo ",  # any sudo invocation
    "systemctl stop ",
    "systemctl disable ",
    "systemctl mask ",
    "systemctl restart ssh",  # captures both `ssh` and `sshd`
    "systemctl restart sshd",
    "systemctl reload ssh",
    "systemctl reload sshd",
    "service ssh ",
    "service sshd ",
    "passwd ",  # password modifications
    "usermod ",  # user account modifications
    "groupmod ",
    "visudo ",
)


def command_requires_human_approval(command: str) -> tuple[bool, str | None]:
    """
    Returns (requires_approval, matched_pattern) for a single command.
    Used by `plan_requires_human_approval` to compute the override.
    """
    cmd_lower = command.lower().strip()
    for pattern in MANDATORY_APPROVAL_PATTERNS:
        if pattern in cmd_lower:
            return True, pattern
    return False, None


def plan_requires_human_approval(commands: list[str]) -> tuple[bool, list[str]]:
    """
    Returns (requires_approval, matched_patterns) for a full plan.

    `matched_patterns` is the de-duplicated list of patterns that hit,
    so the operator-facing audit message can list "sudo, systemctl stop"
    rather than just "yes".
    """
    matched: set[str] = set()
    for cmd in commands:
        hit, pattern = command_requires_human_approval(cmd)
        if hit and pattern is not None:
            matched.add(pattern.strip())
    return len(matched) > 0, sorted(matched)


def escalate_tier_for_commands(
    base_tier: RiskPolicyTier, commands: list[str]
) -> tuple[RiskPolicyTier, list[str]]:
    """
    Compute the effective tier given the base (category+severity)
    classification AND the commands the agent actually proposed.

    The tier never moves DOWN — only up to APPROVAL_REQUIRED. So a
    category that already resolved to APPROVAL_REQUIRED or MANUAL_ONLY
    is returned unchanged. SAFE_GUIDANCE_ONLY also passes through —
    no commands == nothing to escalate.

    Returns (effective_tier, matched_patterns).
    """
    requires_approval, patterns = plan_requires_human_approval(commands)
    if not requires_approval:
        return base_tier, []
    # Only SANDBOX_VERIFIABLE escalates upward — the others are either
    # already at or above APPROVAL_REQUIRED, or are SAFE_GUIDANCE_ONLY
    # (which by definition has no executable commands).
    if base_tier == RiskPolicyTier.SANDBOX_VERIFIABLE:
        return RiskPolicyTier.APPROVAL_REQUIRED, patterns
    return base_tier, patterns


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
