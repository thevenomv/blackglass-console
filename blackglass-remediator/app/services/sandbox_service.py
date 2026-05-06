"""
Sandbox service — lifecycle management for ephemeral DigitalOcean droplets.

Creates, provisions, and destroys sandbox VMs for remediation verification.
"""

from __future__ import annotations

from datetime import datetime

from app.core.config import get_settings
from app.core.logging import get_logger
from app.domain.enums import SandboxStatus
from app.domain.verification_result import SandboxInfo
from app.infra.do_api import DOApiClient, DigitalOceanError, get_do_client

logger = get_logger(__name__)

SANDBOX_TAG = "blackglass-sandbox"


class SandboxService:
    """Manages ephemeral DigitalOcean droplets for verification runs."""

    def __init__(self, do_client: DOApiClient | None = None) -> None:
        self._settings = get_settings()
        self._do_client = do_client

    def _get_client(self) -> DOApiClient:
        if self._do_client:
            return self._do_client
        return get_do_client()

    async def provision(
        self,
        recommendation_id: str,
        distro: str | None = None,
        ssh_key_ids: list[str] | None = None,
    ) -> SandboxInfo:
        """
        Provision a new ephemeral droplet and return its info.
        Waits until the droplet is active.
        """
        client = self._get_client()
        settings = self._settings

        image = self._resolve_image(distro or settings.default_sandbox_image)
        name = f"bg-sandbox-{recommendation_id[:12]}"

        logger.info(
            "sandbox_provisioning",
            recommendation_id=recommendation_id,
            image=image,
            size=settings.default_sandbox_size,
            region=settings.do_region,
        )

        try:
            droplet = await client.create_droplet(
                name=name,
                region=settings.do_region,
                size=settings.default_sandbox_size,
                image=image,
                ssh_keys=ssh_key_ids,
                tags=[SANDBOX_TAG, f"rec-{recommendation_id[:12]}"],
                user_data=self._bootstrap_script(),
            )

            droplet_id = str(droplet["id"])
            ip = await client.wait_for_active(droplet_id)

            info = SandboxInfo(
                droplet_id=droplet_id,
                droplet_ip=ip,
                region=settings.do_region,
                image=image,
                size=settings.default_sandbox_size,
                status=SandboxStatus.RUNNING,
                provisioned_at=datetime.utcnow(),
            )
            logger.info(
                "sandbox_provisioned",
                droplet_id=droplet_id,
                ip=ip,
                recommendation_id=recommendation_id,
            )
            return info

        except DigitalOceanError as e:
            logger.error(
                "sandbox_provision_failed",
                recommendation_id=recommendation_id,
                error=str(e),
            )
            raise

    async def destroy(self, sandbox_info: SandboxInfo) -> SandboxInfo:
        """Destroy the droplet and mark the SandboxInfo as destroyed."""
        if not sandbox_info.droplet_id:
            return sandbox_info

        client = self._get_client()
        try:
            await client.delete_droplet(sandbox_info.droplet_id)
            return sandbox_info.model_copy(
                update={
                    "status": SandboxStatus.DESTROYED,
                    "destroyed_at": datetime.utcnow(),
                }
            )
        except DigitalOceanError as e:
            logger.error(
                "sandbox_destroy_failed",
                droplet_id=sandbox_info.droplet_id,
                error=str(e),
            )
            return sandbox_info.model_copy(update={"status": SandboxStatus.FAILED})

    async def cleanup_stale_sandboxes(self) -> int:
        """
        Find and destroy any leftover sandbox droplets by tag.
        Returns number of droplets destroyed.
        """
        client = self._get_client()
        try:
            droplets = await client.list_droplets_by_tag(SANDBOX_TAG)
            count = 0
            for d in droplets:
                droplet_id = str(d["id"])
                try:
                    await client.delete_droplet(droplet_id)
                    count += 1
                    logger.info("stale_sandbox_cleaned", droplet_id=droplet_id)
                except DigitalOceanError:
                    pass
            return count
        except DigitalOceanError as e:
            logger.error("cleanup_stale_sandboxes_failed", error=str(e))
            return 0

    def _resolve_image(self, distro_hint: str) -> str:
        """Map a distro hint to a DigitalOcean image slug."""
        mapping = {
            "ubuntu-22.04": "ubuntu-22-04-x64",
            "ubuntu-20.04": "ubuntu-20-04-x64",
            "ubuntu-24.04": "ubuntu-24-04-x64",
            "debian-12": "debian-12-x64",
            "debian-11": "debian-11-x64",
            "centos-9": "centos-stream-9-x64",
            "fedora-39": "fedora-39-x64",
        }
        return mapping.get(distro_hint, self._settings.default_sandbox_image)

    def _bootstrap_script(self) -> str:
        """Minimal cloud-init script to prepare the sandbox VM."""
        return """#!/bin/bash
apt-get update -qq 2>/dev/null || yum update -y -q 2>/dev/null || true
echo "sandbox-ready" > /tmp/.blackglass-sandbox-ready
"""
