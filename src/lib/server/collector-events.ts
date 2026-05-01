function loggingDisabled(): boolean {
  const v = process.env.BLACKGLASS_LOG_COLLECTOR?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

/** When false, `logCollectorEvent` is a no-op. */
export function collectorStructuredLoggingEnabled(): boolean {
  return !loggingDisabled();
}

/**
 * One-line JSON logs for log drains (Datadog, DO, etc.). Never pass secret values.
 * Disable with `BLACKGLASS_LOG_COLLECTOR=0`.
 */
export function logCollectorEvent(event: string, fields: Record<string, unknown>): void {
  if (loggingDisabled()) return;
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: "blackglass.collector",
      event,
      ...fields,
    }),
  );
}
