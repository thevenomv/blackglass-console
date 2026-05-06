"""Notification adapter interface — Slack and extensible to other channels."""

from __future__ import annotations

from typing import Protocol

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)


class NotifierProtocol(Protocol):
    async def send_approval_request(
        self,
        recommendation_id: str,
        summary: str,
        tenant_id: str,
        approve_url: str,
        reject_url: str,
    ) -> None: ...


class SlackNotifier:
    """
    Sends interactive Block Kit messages to a Slack webhook URL.
    Supports approval/reject button callbacks.
    """

    def __init__(self, webhook_url: str) -> None:
        self._webhook_url = webhook_url
        self._client = httpx.AsyncClient(timeout=10.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def send_approval_request(
        self,
        recommendation_id: str,
        summary: str,
        tenant_id: str,
        approve_url: str,
        reject_url: str,
    ) -> None:
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "🔍 BLACKGLASS AI: Remediation Proposal Ready",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Summary*\n{summary[:500]}"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Recommendation ID*\n`{recommendation_id}`"},
                    {"type": "mrkdwn", "text": f"*Tenant*\n`{tenant_id}`"},
                ],
            },
            {"type": "divider"},
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        "⚠️ _Review the full recommendation in BLACKGLASS before approving. "
                        "Approval authorises operator-level execution._"
                    ),
                },
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "✅ Approve", "emoji": True},
                        "style": "primary",
                        "url": approve_url,
                        "action_id": "approve_remediation",
                    },
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "❌ Reject", "emoji": True},
                        "style": "danger",
                        "url": reject_url,
                        "action_id": "reject_remediation",
                    },
                ],
            },
        ]

        try:
            resp = await self._client.post(
                self._webhook_url, json={"blocks": blocks}
            )
            resp.raise_for_status()
            logger.info(
                "slack_approval_sent",
                recommendation_id=recommendation_id,
            )
        except httpx.HTTPStatusError as e:
            logger.error(
                "slack_notification_failed",
                status=e.response.status_code,
                recommendation_id=recommendation_id,
            )


class NullNotifier:
    """No-op notifier — used in tests and when Slack is not configured."""

    async def send_approval_request(self, *args, **kwargs) -> None:
        logger.debug("null_notifier_skipped")
