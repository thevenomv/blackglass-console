"""FastAPI dependency injection helpers."""

from __future__ import annotations

from collections.abc import AsyncGenerator

import structlog
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models import get_session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield a SQLAlchemy async session, committing on success."""
    factory = get_session_factory()
    async with factory() as session:
        yield session


def get_request_id(request: Request) -> str:
    """Extract or generate a request correlation ID."""
    return request.headers.get("X-Request-ID", "")


async def bind_request_context(
    request: Request,
    request_id: str = Depends(get_request_id),
) -> None:
    """Bind request metadata to structlog context vars for this request."""
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id or "none",
        method=request.method,
        path=request.url.path,
    )
