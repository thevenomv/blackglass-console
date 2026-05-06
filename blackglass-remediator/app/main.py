"""
FastAPI application entry point for blackglass-remediator.
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.dependencies import bind_request_context
from app.api.routes import approvals, health, remediation, tenants, webhooks
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.telemetry import configure_otel, configure_sentry

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — startup and shutdown hooks."""
    settings = get_settings()
    configure_logging()
    configure_sentry()
    configure_otel()

    logger.info(
        "remediator_starting",
        env=settings.app_env,
        port=settings.port,
        llm_provider=settings.llm_provider,
        sandbox_enabled=settings.enable_sandbox_verification,
    )

    # In development, auto-create tables
    if not settings.is_production:
        from app.infra.db.models import create_tables
        await create_tables()

    yield

    logger.info("remediator_shutdown")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="BLACKGLASS Remediator",
        description=(
            "Human-in-the-loop AI Remediation Companion for BLACKGLASS. "
            "Classifies drift events, generates structured plans, verifies in sandboxes, "
            "and awaits explicit human approval before any production execution."
        ),
        version="0.1.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # ---------------------------------------------------------------------------
    # Middleware
    # ---------------------------------------------------------------------------

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if not settings.is_production else [],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    # ---------------------------------------------------------------------------
    # Exception handlers
    # ---------------------------------------------------------------------------

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled_exception", error=str(exc), path=request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    # ---------------------------------------------------------------------------
    # Routes
    # ---------------------------------------------------------------------------

    app.include_router(health.router)
    app.include_router(webhooks.router, prefix="/api/v1")
    app.include_router(remediation.router, prefix="/api/v1")
    app.include_router(approvals.router, prefix="/api/v1")
    app.include_router(tenants.router, prefix="/api/v1")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=not settings.is_production,
        log_config=None,  # Let structlog handle logging
    )
