/**
 * POST /api/v1/janitor/findings/suppress — dismiss or snooze a finding (persists across rescans).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  jsonError,
  readJsonBodyOptional,
  zodErrorResponse,
} from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkBaselinesRate, clientIp } from "@/lib/server/rate-limit";
import { suppressJanitorFinding } from "@/lib/server/services/janitor-suppression-service";
import { emitSaasAudit } from "@/lib/saas/event-log";

const BodySchema = z
  .object({
    findingId: z.string().uuid(),
    kind: z.enum(["dismiss", "snooze"]),
    snoozeDays: z.number().int().min(1).max(365).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkBaselinesRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("janitor.manage", ["operator", "admin"], {
    request,
  });
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(403, "saas_only", "Charon requires a hosted workspace.", requestId);
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;
  const parsed = BodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const tenantId = access.ctx.tenant.id;
  const days = parsed.data.kind === "snooze" ? (parsed.data.snoozeDays ?? 7) : undefined;
  const snoozeUntil =
    parsed.data.kind === "snooze"
      ? new Date(Date.now() + (days as number) * 86_400_000)
      : undefined;

  try {
    await suppressJanitorFinding({
      tenantId,
      findingId: parsed.data.findingId,
      userId: access.ctx.userId,
      kind: parsed.data.kind,
      snoozeUntil: parsed.data.kind === "snooze" ? snoozeUntil : null,
      note: parsed.data.note ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "finding_not_found") {
      return jsonError(404, "not_found", "Finding not found.", requestId);
    }
    if (msg === "snooze_until_invalid") {
      return jsonError(400, "invalid_snooze", "Snooze requires a future window.", requestId);
    }
    return jsonError(500, "internal_error", "Could not suppress finding.", requestId);
  }

  await emitSaasAudit({
    tenantId,
    actorUserId: access.ctx.userId,
    action: "janitor.finding.suppressed",
    targetType: "janitor_finding",
    targetId: parsed.data.findingId,
    metadata: {
      ...(requestId ? { request_id: requestId } : {}),
      kind: parsed.data.kind,
      ...(days != null ? { snooze_days: days } : {}),
    },
  });

  return NextResponse.json({ ok: true }, { headers: { "x-request-id": requestId } });
}
