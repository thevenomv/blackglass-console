"""Async SSH runner using asyncssh — executes commands on remote hosts."""

from __future__ import annotations

import asyncio
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

# Safety: never allow SSH runner to target non-sandbox hosts from agent tooling.
# Production host execution is a separate code path gated by human approval.

try:
    import asyncssh

    ASYNCSSH_AVAILABLE = True
except ImportError:
    ASYNCSSH_AVAILABLE = False


class SSHConnectionError(Exception):
    pass


class SSHCommandResult:
    def __init__(self, command: str, exit_code: int, stdout: str, stderr: str) -> None:
        self.command = command
        self.exit_code = exit_code
        self.stdout = stdout
        self.stderr = stderr

    @property
    def succeeded(self) -> bool:
        return self.exit_code == 0

    def __repr__(self) -> str:
        return f"SSHCommandResult(exit_code={self.exit_code}, command={self.command!r})"


class SandboxSSHRunner:
    """
    Executes commands on sandbox (ephemeral) hosts only.

    SAFETY CONSTRAINT: This runner must only target sandbox/ephemeral droplets.
    Production host execution requires a separate, explicitly gated code path.
    """

    def __init__(
        self,
        host: str,
        username: str = "root",
        private_key: str | None = None,
        private_key_path: str | None = None,
        port: int = 22,
        known_hosts: Any = None,
    ) -> None:
        if not ASYNCSSH_AVAILABLE:
            raise SSHConnectionError("asyncssh is not installed")
        self._host = host
        self._username = username
        self._private_key = private_key
        self._private_key_path = private_key_path
        self._port = port
        self._known_hosts = known_hosts  # None = accept any (sandbox only)
        self._conn: Any = None

    async def connect(self) -> None:
        connect_kwargs: dict[str, Any] = {
            "host": self._host,
            "port": self._port,
            "username": self._username,
            "known_hosts": self._known_hosts,
        }
        if self._private_key:
            connect_kwargs["client_keys"] = [
                asyncssh.import_private_key(self._private_key)
            ]
        elif self._private_key_path:
            connect_kwargs["client_keys"] = [self._private_key_path]

        self._conn = await asyncssh.connect(**connect_kwargs)
        logger.info("ssh_connected", host=self._host, user=self._username)

    async def run(
        self, command: str, timeout: float = 60.0
    ) -> SSHCommandResult:
        if self._conn is None:
            raise SSHConnectionError("Not connected — call connect() first")

        logger.debug("ssh_run_command", host=self._host, command=command[:200])
        try:
            result = await asyncio.wait_for(
                self._conn.run(command, check=False),
                timeout=timeout,
            )
            return SSHCommandResult(
                command=command,
                exit_code=result.exit_status or 0,
                stdout=result.stdout or "",
                stderr=result.stderr or "",
            )
        except asyncio.TimeoutError:
            return SSHCommandResult(
                command=command,
                exit_code=-1,
                stdout="",
                stderr=f"Command timed out after {timeout}s",
            )

    async def run_many(
        self, commands: list[str], timeout: float = 60.0
    ) -> list[SSHCommandResult]:
        results = []
        for cmd in commands:
            result = await self.run(cmd, timeout=timeout)
            results.append(result)
            if not result.succeeded:
                logger.warning(
                    "ssh_command_failed",
                    host=self._host,
                    command=cmd[:200],
                    exit_code=result.exit_code,
                    stderr=result.stderr[:500],
                )
        return results

    async def disconnect(self) -> None:
        if self._conn is not None:
            self._conn.close()
            await self._conn.wait_closed()
            self._conn = None
            logger.info("ssh_disconnected", host=self._host)

    async def __aenter__(self) -> "SandboxSSHRunner":
        await self.connect()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.disconnect()
