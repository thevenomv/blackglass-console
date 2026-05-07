/**
 * POST /api/v1/preferences/sample-data — toggle the per-browser sample-data view.
 *
 * Sets or clears the `bg-sample-data` cookie. When the cookie is "on",
 * dashboard / drift / etc. render pre-built mock data instead of the live
 * (often empty) tenant data. Useful for:
 *   - new tenants who haven't connected a host yet
 *   - sales / customer demos
 *   - end-to-end smoke tests without spinning up a fake collector
 *
 * Per-browser scope: flipping it for one operator doesn't affect anybody else
 * in the workspace. No DB row, no migration.
 *
 * Auth: any authenticated workspace member can toggle their own view. We
 * still gate it through the saas access guard so unauthenticated callers
 * can't set arbitrary cookies via this surface.
 */

import { cookies } from "next/headers";
import { jsonError, readJsonBodyOptional } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { z } from "zod";
import { SAMPLE_DATA_COOKIE } from "@/lib/server/sample-data";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  enabled: z.boolean(),
});

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  const access = await requireSaasOrLegacyPermission("reports.view", [
    "viewer",
    "auditor",
    "operator",
    "admin",
  ]);
  if (!access.ok) return access.response;

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.data);
  if (!parsed.success) {
    return jsonError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid input.", requestId);
  }

  const jar = await cookies();
  if (parsed.data.enabled) {
    jar.set(SAMPLE_DATA_COOKIE, "on", {
      path: "/",
      httpOnly: false, // client toggle reads this to render the banner — needs JS access
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  } else {
    jar.delete(SAMPLE_DATA_COOKIE);
  }

  return jsonWithRequestId({ enabled: parsed.data.enabled }, requestId);
}
