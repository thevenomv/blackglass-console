"""Security utilities — webhook signature verification, API auth."""

from __future__ import annotations

import hashlib
import hmac
import secrets

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
