/**
 * GET  /api/v1/settings/notifications  — read tenant alert routing
 * PUT  /api/v1/settings/notifications  — replace alert routing destinations
 *
 * Settings are tenant-scoped (one row per tenant in saas_tenant_notifications).
 * Empty / blank fields fall back to the deployment-wide env defaults so a
 * single deployment can mix per-tenant overrides with global defaults.
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
import {
  getTenantNotificationsRls,
  setTenantNotifications,
} from "@/lib/server/services/notifications-service";

const NotificationsSchema = z.object({
  alertEmailTo: z.string().max(2000).nullable().optional(),
  webhookUrls: z.string().max(4000).nullable().optional(),
  slackWebhookUrl: z
    .string()
    .max(500)
    .url()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  pdRoutingKey: z.string().max(200).nullable().optional(),
});

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "Tenant notifications require SaaS mode.", requestId);
  }

  const settings = await getTenantNotificationsRls(access.ctx.tenant.id);
  // Don't echo the env-fallback secret values; only expose the per-tenant overrides
  // (which the operator already entered).  Returning the resolved routing risks
  // leaking deployment-wide WEBHOOK_URLS to a tenant who didn't set their own.
  return NextResponse.json({
    settings: {
      alertEmailTo: settings.alertEmailTo,
      webhookUrls: settings.webhookUrls.join(","),
      slackWebhookUrl: settings.slackWebhookUrl,
      pdRoutingKey: settings.pdRoutingKey ? "••••••" : null,
    },
    requestId,
  });
}

export async function PUT(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!(await checkScanPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("settings.write", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(400, "not_supported", "Tenant notifications require SaaS mode.", requestId);
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = NotificationsSchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  await setTenantNotifications(access.ctx.tenant.id, parsed.data);

  return NextResponse.json({ ok: true, requestId });
}
