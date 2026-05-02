/**
 * Next.js instrumentation hook — loaded once per server process.
 * Initialises Sentry for the correct runtime when DSN is configured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
