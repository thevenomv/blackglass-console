import { NextResponse } from "next/server";
import type { ZodError } from "zod";

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
