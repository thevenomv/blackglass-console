"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings
from app.infra.ollama_client import get_ollama_client

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    env: str
    version: str = "0.1.0"
    checks: dict[str, str] = {}


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Basic liveness probe."""
    settings = get_settings()
    return HealthResponse(
        status="ok",
        env=settings.app_env,
    )


@router.get("/health/ready", response_model=HealthResponse)
async def readiness() -> HealthResponse:
    """Readiness probe — checks Ollama connectivity."""
    settings = get_settings()
    checks: dict[str, str] = {}

    # Check Ollama
    try:
        ollama = get_ollama_client()
        available = await ollama.is_available()
        checks["ollama"] = "ok" if available else "degraded"
        await ollama.aclose()
    except Exception as e:
        checks["ollama"] = f"error: {e}"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return HealthResponse(status=overall, env=settings.app_env, checks=checks)
