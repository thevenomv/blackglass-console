"""OpenTelemetry and Sentry telemetry bootstrap."""

from __future__ import annotations

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def configure_sentry() -> None:
    """Initialise Sentry SDK if DSN is configured."""
    settings = get_settings()
    if not settings.sentry_dsn:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.app_env,
            traces_sample_rate=0.1 if settings.is_production else 1.0,
            integrations=[FastApiIntegration(), SqlalchemyIntegration()],
            send_default_pii=False,
        )
        logger.info("sentry_initialised", env=settings.app_env)
    except ImportError:
        logger.warning("sentry_sdk not installed — skipping Sentry init")


def configure_otel() -> None:
    """Initialise OpenTelemetry if an endpoint is configured."""
    settings = get_settings()
    if not settings.otel_endpoint:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import SERVICE_NAME, Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({SERVICE_NAME: "blackglass-remediator"})
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=settings.otel_endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        logger.info("otel_initialised", endpoint=settings.otel_endpoint)
    except ImportError:
        logger.warning("opentelemetry packages not installed — skipping OTel init")
