/** Absolute origin for server-side fetch to this app's Route Handlers. */
export function internalAppOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
}

/** Base URL for BLACKGLASS HTTP API (versioned). */
export function apiV1BaseUrl(): string {
  const custom = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (custom) return custom;
  return `${internalAppOrigin()}/api/v1`;
}
