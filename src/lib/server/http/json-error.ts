import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Canonical 429 response for v1 routes. Centralised so every handler
 * returns the same `{ error: "rate_limited", detail }` envelope plus a
 * `Retry-After` header — downstream SDKs and CLI tools can rely on it
 * instead of branching on per-route ad-hoc shapes.
 *
 * `retryAfterSeconds` defaults to 60s which matches the longest
 * window in `src/lib/server/rate-limit.ts`.
 */
export function rateLimitedResponse(
  requestId?: string,
  retryAfterSeconds = 60,
) {
  const response = jsonError(
    429,
    "rate_limited",
    "Too many requests — slow down and retry shortly.",
    requestId,
  );
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

/** Consistent API error envelope for v1 route handlers. */
export function jsonError(status: number, error: string, detail?: string, requestId?: string) {
  if (status >= 500) {
    console.error(`[blackglass] ${status} ${error}${detail ? ": " + detail : ""}`);
  }
  const headers: Record<string, string> = {
    "Content-Security-Policy": "default-src 'none'",
  };
  if (requestId) headers["x-request-id"] = requestId;
  return NextResponse.json(
    { error, ...(detail !== undefined && detail !== "" ? { detail } : {}) },
    { status, headers },
  );
}

/**
 * Like `jsonError` but adds a `remedy` field with concrete next-step
 * guidance. Used by the onboarding / push-agent surface where the user
 * is most likely to hit unfamiliar failure modes and benefits from
 * specific actions.
 */
export function jsonErrorWithRemedy(
  status: number,
  error: string,
  detail: string,
  remedy: string,
  requestId?: string,
) {
  if (status >= 500) {
    console.error(`[blackglass] ${status} ${error}: ${detail}`);
  }
  const headers: Record<string, string> = {
    "Content-Security-Policy": "default-src 'none'",
  };
  if (requestId) headers["x-request-id"] = requestId;
  return NextResponse.json(
    { error, detail, remedy },
    { status, headers },
  );
}

export function zodErrorResponse(err: ZodError, requestId?: string) {
  const flat = err.flatten();
  const parts = [
    ...flat.formErrors,
    ...Object.values(flat.fieldErrors)
      .flat()
      .filter((x): x is string => Boolean(x)),
  ];
  return jsonError(400, "validation_failed", parts.join("; ") || err.message, requestId);
}

/** Empty body → `{}`. Invalid JSON → error response (caller returns early). */
export async function readJsonBodyOptional(
  request: Request,
  requestId?: string,
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  const text = await request.text();
  if (!text.trim()) return { ok: true, data: {} };
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: jsonError(400, "invalid_json", "Request body must be valid JSON", requestId),
    };
  }
}
