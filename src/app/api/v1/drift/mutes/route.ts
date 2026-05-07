/**
 * GET  /api/v1/drift/mutes  — list snooze rules for the calling tenant
 * POST /api/v1/drift/mutes  — create a new snooze rule
 *
 * Snoozed findings are kept in the audit trail but flipped to
 * lifecycle:"accepted_risk" so they stop alerting / firing webhooks.
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
import { checkReadApiRate, checkScanPostRate, clientIp } from "@/lib/server/rate-limit";
import { createMute, listMutes } from "@/lib/server/services/drift-mute-service";

const DRIFT_CATEGORIES = [
  "ssh", "network_exposure", "firewall", "packages",
  "integrity", "identity", "privilege_escalation", "persistence",
] as const;

const CreateBodySchema = z.object({
  category: z.enum(DRIFT_CATEGORIES),
  titlePattern: z.string().min(1).max(200),
  hostId: z.string().min(1).max(64).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  /** ISO date — when null/omitted the mute is permanent. */
  mutedUntil: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission(
    "drift.manage",
    ["operator", "admin"],
  );
  if (!access.ok) return access.response;
  if (access.mode === "legacy") return NextResponse.json({ mutes: [] });

  const mutes = await listMutes(access.ctx.tenant.id);
  return NextResponse.json({ mutes });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission(
    "drift.manage",
    ["operator", "admin"],
  );
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "Drift mutes require SaaS mode.", requestId);
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = CreateBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const mute = await createMute(access.ctx.tenant.id, access.ctx.userId, {
    category: parsed.data.category,
    titlePattern: parsed.data.titlePattern,
    hostId: parsed.data.hostId ?? null,
    reason: parsed.data.reason ?? null,
    mutedUntil: parsed.data.mutedUntil ?? null,
  });
  return NextResponse.json({ mute }, { status: 201 });
}
