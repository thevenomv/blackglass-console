import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/** Consistent API error envelope for v1 route handlers. */
export function jsonError(status: number, error: string, detail?: string) {
  if (status >= 500) {
    console.error(`[blackglass] ${status} ${error}${detail ? ": " + detail : ""}`);
  }
  return NextResponse.json(
    { error, ...(detail !== undefined && detail !== "" ? { detail } : {}) },
    { status },
  );
}

export function zodErrorResponse(err: ZodError) {
  const flat = err.flatten();
  const parts = [
    ...flat.formErrors,
    ...Object.values(flat.fieldErrors)
      .flat()
      .filter((x): x is string => Boolean(x)),
  ];
  return jsonError(400, "validation_failed", parts.join("; ") || err.message);
}

/** Empty body → `{}`. Invalid JSON → error response (caller returns early). */
export async function readJsonBodyOptional(
  request: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  const text = await request.text();
  if (!text.trim()) return { ok: true, data: {} };
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: jsonError(400, "invalid_json", "Request body must be valid JSON") };
  }
}
