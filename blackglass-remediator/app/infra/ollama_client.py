"""Ollama client adapter for local LLM inference."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class OllamaError(Exception):
    pass


class OllamaClient:
    """
    Thin async client for Ollama's /api/chat endpoint.
    Used by PydanticAI model provider adapter.
    """

    def __init__(self, base_url: str, model: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=120.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.1,
        format: str | None = "json",
    ) -> str:
        """Send a chat request and return the assistant message content."""
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if format:
            payload["format"] = format

        logger.debug("ollama_chat_request", model=self._model, n_messages=len(messages))

        try:
            resp = await self._client.post("/api/chat", json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise OllamaError(f"Ollama API error: {e.response.status_code} {e.response.text}") from e
        except httpx.RequestError as e:
            raise OllamaError(f"Ollama connection error: {e}") from e

        data = resp.json()
        content: str = data["message"]["content"]
        logger.debug("ollama_chat_response", model=self._model, length=len(content))
        return content

    async def is_available(self) -> bool:
        """Check if Ollama is reachable and the configured model is available."""
        try:
            resp = await self._client.get("/api/tags", timeout=5.0)
            if resp.status_code != 200:
                return False
            models = [m["name"] for m in resp.json().get("models", [])]
            available = any(m.startswith(self._model.split(":")[0]) for m in models)
            if not available:
                logger.warning("ollama_model_not_found", model=self._model, available=models)
            return available
        except Exception:
            return False


def get_ollama_client() -> OllamaClient:
    settings = get_settings()
    return OllamaClient(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
    )
