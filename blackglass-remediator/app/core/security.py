"""Security utilities — webhook signature verification, API auth, approval tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException, Request, status

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def verify_blackglass_signature(body: bytes, signature: str | None) -> None:
    """
    Verify the X-Blackglass-Signature header on incoming webhook requests.

    Uses HMAC-SHA256: signature = hex(HMAC-SHA256(body, WEBHOOK_SECRET))

    Raises HTTP 401 if verification fails.
    Does NOT raise if no secret is configured (allows dev mode without secret).
    """
    settings = get_settings()
    secret = settings.blackglass_webhook_secret

    if secret is None:
        if settings.is_production:
            logger.warning("blackglass_webhook_secret not set in production — accepting unsigned")
        return

    if not signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Blackglass-Signature header",
        )

    expected = hmac.new(
        secret.get_secret_value().encode(),
        body,
        hashlib.sha256,
    ).hexdigest()

    # Constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(expected, signature.lower()):
        logger.warning("webhook_signature_mismatch")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )


async def get_webhook_body_and_verify(
    request: Request,
    x_blackglass_signature: str | None = Header(default=None),
) -> bytes:
    """FastAPI dependency: reads raw body and verifies BLACKGLASS signature."""
    body = await request.body()
    verify_blackglass_signature(body, x_blackglass_signature)
    return body


def require_api_key(
    x_api_key: str | None = Header(default=None),
) -> None:
    """FastAPI dependency: validates internal service API key."""
    settings = get_settings()
    expected = settings.api_secret_key.get_secret_value()

    if not x_api_key or not secrets.compare_digest(expected, x_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


def sanitize_for_log(value: str, max_length: int = 200) -> str:
    """Truncate and strip control characters from strings before logging."""
    sanitized = "".join(c for c in value if c.isprintable() or c in "\n\t")
    return sanitized[:max_length] + ("…" if len(sanitized) > max_length else "")


# ---------------------------------------------------------------------------
# Approval Token verifier
# ---------------------------------------------------------------------------
#
# Counterpart of src/lib/server/remediator/approval-token.ts in the
# Console. The Console mints a short-lived HMAC-SHA256 token whenever
# an operator clicks Approve / Reject, and the remediator verifies it
# here BEFORE acting on the decision. This way, a leaked remediator
# API key alone is insufficient to fabricate approvals — an attacker
# would also need REMEDIATOR_APPROVAL_TOKEN_SECRET (which only the
# Console deployment holds).
#
# Format: <payload_b64url>.<signature_b64url>
#   payload   = base64url(JSON.stringify({rid, tid, dec, act, iat, exp}))
#   signature = base64url(HMAC-SHA256(payload_b64url, secret))
#
# Enforcement is opt-in via REMEDIATOR_APPROVAL_TOKEN_SECRET — when the
# env var is set the remediator REQUIRES a valid token; when unset it
# falls back to legacy "trust the API key alone" mode for backwards
# compat with existing deployments.


@dataclass(frozen=True)
class ApprovalTokenPayload:
    rid: str  # recommendation id
    tid: str  # tenant id
    dec: str  # "approve" | "reject"
    act: str  # actor id
    iat: int  # issued-at, unix seconds
    exp: int  # expiry, unix seconds


def _approval_secret() -> str | None:
    raw = os.environ.get("REMEDIATOR_APPROVAL_TOKEN_SECRET", "").strip()
    if not raw:
        return None
    if len(raw) < 32:
        # Mis-configuration — fail closed loudly so operators notice
        # the typo / truncated copy-paste before it leaks into a
        # production approval. The behavioural alternative (silently
        # treating a too-short secret as "not configured") is worse.
        raise RuntimeError(
            "REMEDIATOR_APPROVAL_TOKEN_SECRET must be >=32 characters."
        )
    return raw


def _approval_enforcement_optional() -> bool:
    """
    Operator escape hatch for legacy deployments that haven't
    rolled out the shared secret yet. Set REMEDIATOR_APPROVAL_TOKEN_OPTIONAL=1
    to fall back to the previous "trust the API key alone" mode.

    Default is FALSE — enforcement is on by default for any new
    deployment, because silent fall-back to "trust the API key"
    would let an operator believe they had HITL signed-token
    enforcement when they actually didn't (the original opt-in
    behaviour was the footgun this defaults-on closes).
    """
    raw = os.environ.get("REMEDIATOR_APPROVAL_TOKEN_OPTIONAL", "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def approval_token_enforcement_enabled() -> bool:
    """
    True when the remediator REQUIRES signed approval tokens for
    every approve / reject decision.

    Behaviour matrix (env vars):

      | SECRET set | OPTIONAL set | enforcement | rationale                       |
      |------------|--------------|-------------|---------------------------------|
      | yes        | -            | ON          | normal, intended path           |
      | no         | yes          | OFF         | legacy opt-out (warned at boot) |
      | no         | no           | RAISES      | mis-config; fail closed at boot |

    The "raises" case happens lazily — verify_approval_token would
    HTTP-500 on the first approve attempt with detail
    `approval_token_secret_not_configured`, surfacing the mis-config
    immediately rather than silently letting the API key alone be
    trusted. Operators upgrading must either set the secret or
    explicitly opt out.
    """
    secret = _approval_secret()
    if secret is not None:
        return True
    if _approval_enforcement_optional():
        return False
    # Secret missing AND no opt-out — treat as enforcement ON so the
    # next approve attempt surfaces a clear mis-config error rather
    # than silently degrading.
    return True


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def verify_approval_token(
    token: str,
    *,
    expected_recommendation_id: str,
    expected_tenant_id: str,
    expected_decision: str | None = None,
) -> ApprovalTokenPayload:
    """
    Verify an approval token issued by the Console.

    Raises HTTPException(401) on any failure WITHOUT revealing which
    specific check failed in security-meaningful detail. Logs a
    warning with the generic reason for ops debugging.
    """
    secret = _approval_secret()
    if secret is None:
        # Caller should check approval_token_enforcement_enabled()
        # first — reaching here means we expected a token but the
        # secret isn't configured.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="approval_token_secret_not_configured",
        )

    if not isinstance(token, str) or "." not in token:
        logger.warning("approval_token_rejected", reason="malformed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")

    payload_b64, _, sig_b64 = token.partition(".")
    if not payload_b64 or not sig_b64:
        logger.warning("approval_token_rejected", reason="malformed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")

    expected_sig = hmac.new(
        secret.encode(), payload_b64.encode(), hashlib.sha256
    ).digest()
    try:
        provided_sig = _b64url_decode(sig_b64)
    except (ValueError, TypeError):
        logger.warning("approval_token_rejected", reason="bad_signature_b64")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")

    if len(provided_sig) != len(expected_sig) or not hmac.compare_digest(
        provided_sig, expected_sig
    ):
        logger.warning("approval_token_rejected", reason="bad_signature")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")

    try:
        payload_raw = _b64url_decode(payload_b64).decode("utf-8")
        payload_dict = json.loads(payload_raw)
    except (ValueError, UnicodeDecodeError):
        logger.warning("approval_token_rejected", reason="bad_payload")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")

    try:
        payload = ApprovalTokenPayload(
            rid=str(payload_dict["rid"]),
            tid=str(payload_dict["tid"]),
            dec=str(payload_dict["dec"]),
            act=str(payload_dict["act"]),
            iat=int(payload_dict["iat"]),
            exp=int(payload_dict["exp"]),
        )
    except (KeyError, TypeError, ValueError):
        logger.warning("approval_token_rejected", reason="bad_payload_shape")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")

    now = int(time.time())
    if payload.exp < now:
        logger.warning("approval_token_rejected", reason="expired")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")
    if payload.iat > now + 60:
        logger.warning("approval_token_rejected", reason="iat_in_future")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")

    if payload.dec not in ("approve", "reject"):
        logger.warning("approval_token_rejected", reason="bad_decision")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")

    if payload.rid != expected_recommendation_id:
        logger.warning("approval_token_rejected", reason="recommendation_mismatch")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")
    if payload.tid != expected_tenant_id:
        logger.warning("approval_token_rejected", reason="tenant_mismatch")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")
    if expected_decision and payload.dec != expected_decision:
        logger.warning("approval_token_rejected", reason="decision_mismatch")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_approval_token")

    return payload
