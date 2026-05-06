"""DigitalOcean API client for ephemeral sandbox droplets."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

DO_API_BASE = "https://api.digitalocean.com/v2"


class DigitalOceanError(Exception):
    pass


class DOApiClient:
    """Async client for DigitalOcean droplet lifecycle management."""

    def __init__(self, token: str) -> None:
        self._token = token
        self._client = httpx.AsyncClient(
            base_url=DO_API_BASE,
            headers={"Authorization": f"Bearer {self._token}"},
            timeout=60.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def create_droplet(
        self,
        name: str,
        region: str,
        size: str,
        image: str,
        ssh_keys: list[str] | None = None,
        tags: list[str] | None = None,
        user_data: str | None = None,
    ) -> dict[str, Any]:
        """Create a new ephemeral droplet. Returns the droplet dict."""
        payload: dict[str, Any] = {
            "name": name,
            "region": region,
            "size": size,
            "image": image,
            "backups": False,
            "ipv6": False,
            "monitoring": False,
            "tags": tags or ["blackglass-sandbox"],
        }
        if ssh_keys:
            payload["ssh_keys"] = ssh_keys
        if user_data:
            payload["user_data"] = user_data

        resp = await self._client.post("/droplets", json=payload)
        if resp.status_code not in (200, 201, 202):
            raise DigitalOceanError(f"Failed to create droplet: {resp.status_code} {resp.text}")

        return resp.json()["droplet"]

    async def get_droplet(self, droplet_id: str) -> dict[str, Any]:
        resp = await self._client.get(f"/droplets/{droplet_id}")
        if resp.status_code != 200:
            raise DigitalOceanError(f"Droplet {droplet_id} not found: {resp.status_code}")
        return resp.json()["droplet"]

    async def wait_for_active(
        self, droplet_id: str, timeout_seconds: int = 180, poll_interval: int = 5
    ) -> str:
        """Poll until the droplet is active and return its public IPv4 address."""
        elapsed = 0
        while elapsed < timeout_seconds:
            droplet = await self.get_droplet(droplet_id)
            status = droplet.get("status")
            if status == "active":
                for network in droplet.get("networks", {}).get("v4", []):
                    if network.get("type") == "public":
                        ip: str = network["ip_address"]
                        logger.info(
                            "sandbox_droplet_active",
                            droplet_id=droplet_id,
                            ip=ip,
                        )
                        return ip
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        raise DigitalOceanError(
            f"Droplet {droplet_id} did not become active within {timeout_seconds}s"
        )

    async def delete_droplet(self, droplet_id: str) -> None:
        resp = await self._client.delete(f"/droplets/{droplet_id}")
        if resp.status_code not in (200, 204):
            raise DigitalOceanError(
                f"Failed to delete droplet {droplet_id}: {resp.status_code}"
            )
        logger.info("sandbox_droplet_deleted", droplet_id=droplet_id)

    async def list_droplets_by_tag(self, tag: str) -> list[dict[str, Any]]:
        resp = await self._client.get("/droplets", params={"tag_name": tag})
        if resp.status_code != 200:
            raise DigitalOceanError(f"Failed to list droplets by tag: {resp.status_code}")
        return resp.json().get("droplets", [])


def get_do_client() -> DOApiClient:
    settings = get_settings()
    if not settings.digitalocean_token:
        raise DigitalOceanError("DIGITALOCEAN_TOKEN is not configured")
    return DOApiClient(settings.digitalocean_token.get_secret_value())
