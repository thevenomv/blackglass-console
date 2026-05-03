/**
 * Minimal structured logs (JSON lines) with optional x-request-id correlation.
 * Prefer this for operational events instead of string-only console.log in new code.
 */
export function logStructured(
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
