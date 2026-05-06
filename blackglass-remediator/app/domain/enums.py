"""Domain enumerations for blackglass-remediator."""

from enum import StrEnum


class DriftSeverity(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DriftCategory(StrEnum):
    NETWORK_EXPOSURE = "network_exposure"
    IDENTITY = "identity"
    PERSISTENCE = "persistence"
    SSH = "ssh"
    FIREWALL = "firewall"
    PACKAGES = "packages"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    AUTHORIZED_KEYS = "authorized_keys"
    SYSTEMD = "systemd"
    CRON = "cron"
    KERNEL = "kernel"
    FILESYSTEM = "filesystem"
    OTHER = "other"


class RiskPolicyTier(StrEnum):
    """Determines what automation level is permitted for a drift event."""

    SAFE_GUIDANCE_ONLY = "safe_guidance_only"
    """Explain drift but never generate executable commands."""

    SANDBOX_VERIFIABLE = "sandbox_verifiable"
    """Generate commands and verify in a sandboxed environment."""

    APPROVAL_REQUIRED = "approval_required"
    """Always requires explicit human approval before any real execution."""

    MANUAL_ONLY = "manual_only"
    """No automated proposal beyond explanation/checklist."""


class RecommendationStatus(StrEnum):
    DRAFT = "draft"
    VERIFIED = "verified"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    EXECUTED = "executed"
    FAILED = "failed"


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class CommandRiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SandboxStatus(StrEnum):
    PROVISIONING = "provisioning"
    RUNNING = "running"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    DESTROYED = "destroyed"


class VerificationOutcome(StrEnum):
    PASSED = "passed"
    FAILED = "failed"
    INCONCLUSIVE = "inconclusive"
    SKIPPED = "skipped"
