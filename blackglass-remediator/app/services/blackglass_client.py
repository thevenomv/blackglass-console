"""BLACKGLASS API client — sends callbacks and fetches data from the Next.js app."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.enums import RecommendationStatus

logger = get_logger(__name__)


class BlackglassClientError(Exception):
    pass


class BlackglassClient:
    """
    Async HTTP client for the BLACKGLASS SaaS API.

    Contract (BLACKGLASS must implement these endpoints):
      POST /api/v1/remediations/callback  — receive recommendation status updates
      GET  /api/v1/drift/{drift_event_id} — fetch full drift event details
    """

    def __init__(self, base_url: str, api_token: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {api_token}",
                "X-Agent": "blackglass-remediator/1.0",
            },
            timeout=30.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def post_remediation_status(
        self,
        tenant_id: str,
        recommendation_id: str,
        status: RecommendationStatus,
        summary: str | None = None,
        confidence_score: float | None = None,
        plan_id: str | None = None,
    ) -> None:
        """
        Notify BLACKGLASS that a recommendation has been created or its status changed.
        BLACKGLASS uses this to update the drift event UI.
        """
        payload: dict[str, Any] = {
            "tenant_id": tenant_id,
            "recommendation_id": recommendation_id,
            "status": status,
        }
        if summary:
            payload["summary"] = summary
        if confidence_score is not None:
            payload["confidence_score"] = confidence_score
        if plan_id:
            payload["plan_id"] = plan_id

        try:
            resp = await self._client.post("/api/v1/remediations/callback", json=payload)
            resp.raise_for_status()
            logger.info(
                "blackglass_callback_sent",
                recommendation_id=recommendation_id,
                status=status,
            )
        except httpx.HTTPStatusError as e:
            logger.error(
                "blackglass_callback_failed",
                status_code=e.response.status_code,
                recommendation_id=recommendation_id,
            )
        except httpx.RequestError as e:
            logger.error(
                "blackglass_callback_network_error",
                error=str(e),
                recommendation_id=recommendation_id,
            )

    async def post_approval_status(
        self,
        tenant_id: str,
        recommendation_id: str,
        approved: bool,
        actor_id: str,
        reason: str | None = None,
    ) -> None:
        """Notify BLACKGLASS of an approval/rejection decision."""
        payload: dict[str, Any] = {
            "tenant_id": tenant_id,
            "recommendation_id": recommendation_id,
            "approved": approved,
            "actor_id": actor_id,
        }
        if reason:
            payload["reason"] = reason

        try:
            resp = await self._client.post("/api/v1/remediations/approval-callback", json=payload)
            resp.raise_for_status()
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            logger.error("blackglass_approval_callback_failed", error=str(e))

    async def fetch_drift_event(self, drift_event_id: str) -> dict[str, Any]:
        """Fetch full drift event details from BLACKGLASS."""
        try:
            resp = await self._client.get(f"/api/v1/drift/{drift_event_id}")
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return data
        except httpx.HTTPStatusError as e:
            raise BlackglassClientError(
                f"Failed to fetch drift event {drift_event_id}: {e.response.status_code}"
            ) from e


def get_blackglass_client() -> BlackglassClient | None:
    """Return a configured BLACKGLASS client or None if not configured."""
    settings = get_settings()
    if not settings.blackglass_api_token:
        logger.warning("blackglass_api_token_not_set — callbacks disabled")
        return None
    return BlackglassClient(
        base_url=settings.blackglass_api_base_url,
        api_token=settings.blackglass_api_token.get_secret_value(),
    )
