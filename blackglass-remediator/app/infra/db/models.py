"""SQLAlchemy async database models and engine setup."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------


class RecommendationRow(Base):
    __tablename__ = "remediation_recommendations"

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    workspace_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    risk_policy_tier: Mapped[str | None] = mapped_column(String(32), nullable=True)
    drift_event: Mapped[dict] = mapped_column(JSONB, nullable=False)
    plan: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    verification_result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    approval: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    audit_log: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentTraceRow(Base):
    __tablename__ = "agent_traces"

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    recommendation_id: Mapped[str] = mapped_column(
        String(26), nullable=False, index=True
    )
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    model_name: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False)
    input_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    output_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class VerificationRunRow(Base):
    __tablename__ = "verification_runs"

    id: Mapped[str] = mapped_column(String(26), primary_key=True)
    recommendation_id: Mapped[str] = mapped_column(
        String(26), nullable=False, index=True
    )
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    sandbox_info: Mapped[dict] = mapped_column(JSONB, nullable=False)
    artifacts: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    confidence_adjustment: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Engine / Session factory
# ---------------------------------------------------------------------------

_engine = None
_sessionmaker = None


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            echo=settings.debug,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            bind=get_engine(),
            expire_on_commit=False,
            class_=AsyncSession,
        )
    return _sessionmaker


async def create_tables() -> None:
    """Create all tables. Only used in development; use Alembic in production."""
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
