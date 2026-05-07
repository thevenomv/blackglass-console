import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    // Optional OpenTelemetry export — no-op unless OTEL_EXPORTER_OTLP_ENDPOINT
    // is set AND the @opentelemetry/* packages are installed.  Initialised
    // *after* Sentry so Sentry's TracerProvider stays the global default;
    // see src/lib/observability/otel.ts for the coexistence note.
    const { initOpenTelemetry } = await import("./lib/observability/otel");
    await initOpenTelemetry();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
