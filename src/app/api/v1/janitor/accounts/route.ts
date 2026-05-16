/**
 * GET  /api/v1/janitor/accounts — list linked cloud accounts (tokens redacted)
 * POST /api/v1/janitor/accounts — link cloud read credentials (DO live-validated; AWS/GCP JSON shapes Zod-validated when applicable)
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { withTenantRls } from "@/db";
import { janitorAccounts } from "@/db/schema";
import {
  jsonError,
  readJsonBodyOptional,
  zodErrorResponse,
} from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import {
  checkJanitorAccountPostRate,
  checkReadApiRate,
  clientIp,
} from "@/lib/server/rate-limit";
import { encryptKey } from "@/lib/server/secrets/envelope";
import { validateDigitalOceanToken } from "@/lib/server/janitor/do-client";
import { validateAwsReadCredentialStub } from "@/lib/server/janitor/aws-read-stub";
import { validateGcpReadCredentialStub } from "@/lib/server/janitor/gcp-read-stub";
import { validateJanitorCredentialJsonShape } from "@/lib/janitor/janitor-account-credentials";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { isCharonAddonEnabled, resolveCharonEntitlements } from "@/lib/saas/plans";

const PostBodySchema = z.discriminatedUnion("provider", [
  z
    .object({
      provider: z.literal("do"),
      accountName: z.string().min(1).max(120),
      apiToken: z.string().min(12).max(8192),
      scanSchedule: z.enum(["manual", "daily", "weekly"]).default("manual"),
    })
    .strict(),
  z
    .object({
      provider: z.literal("aws"),
      accountName: z.string().min(1).max(120),
      apiToken: z.string().min(32).max(16384),
      scanSchedule: z.enum(["manual", "daily", "weekly"]).default("manual"),
    })
    .strict(),
  z
    .object({
      provider: z.literal("gcp"),
      accountName: z.string().min(1).max(120),
      apiToken: z.string().min(32).max(16384),
      scanSchedule: z.enum(["manual", "daily", "weekly"]).default("manual"),
    })
    .strict(),
]);

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkReadApiRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("janitor.read", ["operator", "admin"], {
    request,
  });
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return NextResponse.json({ accounts: [] }, { headers: { "x-request-id": requestId } });
  }

  const tenantId = access.ctx.tenant.id;
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select({
        id: janitorAccounts.id,
        provider: janitorAccounts.provider,
        accountName: janitorAccounts.accountName,
        scopesVerified: janitorAccounts.scopesVerified,
        lastScanAt: janitorAccounts.lastScanAt,
        lastScanStatus: janitorAccounts.lastScanStatus,
        lastScanError: janitorAccounts.lastScanError,
        lastScanDiff: janitorAccounts.lastScanDiff,
        scanSchedule: janitorAccounts.scanSchedule,
        createdAt: janitorAccounts.createdAt,
      })
      .from(janitorAccounts)
      .where(eq(janitorAccounts.tenantId, tenantId)),
  );

  const entitlements = resolveCharonEntitlements(access.ctx.subscription.planCode, {
    charonAddon: isCharonAddonEnabled(access.ctx.subscription.features),
  });

  return NextResponse.json(
    { accounts: rows, entitlements },
    { headers: { "x-request-id": requestId } },
  );
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  if (!(await checkJanitorAccountPostRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", undefined, requestId);
  }

  const access = await requireSaasOrLegacyPermission("janitor.manage", ["operator", "admin"], {
    request,
  });
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      403,
      "saas_only",
      "Charon requires a hosted Blackglass workspace with Clerk.",
      requestId,
    );
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;
  const parsed = PostBodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const { provider, accountName, apiToken, scanSchedule } = parsed.data;
  const tenantId = access.ctx.tenant.id;

  if (provider === "aws" || provider === "gcp") {
    const t = apiToken.trim();
    if (t.startsWith("{")) {
      let obj: unknown;
      try {
        obj = JSON.parse(t);
      } catch {
        return jsonError(
          400,
          "invalid_json",
          "Cloud credential JSON could not be parsed.",
          requestId,
        );
      }
      const shape = validateJanitorCredentialJsonShape(provider, obj);
      if (!shape.success) return zodErrorResponse(shape.error, requestId);
    }
  }

  const ent = resolveCharonEntitlements(access.ctx.subscription.planCode, {
    charonAddon: isCharonAddonEnabled(access.ctx.subscription.features),
  });
  if (scanSchedule !== "manual" && !ent.scheduledScansAllowed) {
    return jsonError(
      403,
      "charon_plan_blocked",
      "Scheduled Charon scans require a plan with scheduled drift scans enabled (Starter and above).",
      requestId,
    );
  }

  const [existingSameSlot] = await withTenantRls(tenantId, (db) =>
    db
      .select({ id: janitorAccounts.id })
      .from(janitorAccounts)
      .where(
        and(
          eq(janitorAccounts.tenantId, tenantId),
          eq(janitorAccounts.accountName, accountName),
          eq(janitorAccounts.provider, provider),
        ),
      )
      .limit(1),
  );

  if (!existingSameSlot && ent.linkedAccountsMax >= 0) {
    const [cntRow] = await withTenantRls(tenantId, (db) =>
      db
        .select({ c: count() })
        .from(janitorAccounts)
        .where(eq(janitorAccounts.tenantId, tenantId)),
    );
    const n = Number(cntRow?.c ?? 0);
    if (n >= ent.linkedAccountsMax) {
      return jsonError(
        403,
        "plan_limit_exceeded",
        `Your plan allows up to ${ent.linkedAccountsMax} linked cloud account(s). Upgrade to add more.`,
        requestId,
      );
    }
  }

  let probe:
    | { ok: true; verified: string[] }
    | { ok: false; status: number; detail: string };

  if (provider === "do") {
    probe = await validateDigitalOceanToken(apiToken);
  } else if (provider === "aws") {
    probe = await validateAwsReadCredentialStub(apiToken);
  } else {
    probe = await validateGcpReadCredentialStub(apiToken);
  }

  if (!probe.ok) {
    return jsonError(
      probe.status >= 400 && probe.status < 500 ? probe.status : 400,
      "invalid_cloud_token",
      probe.detail,
      requestId,
    );
  }

  const encrypted = await encryptKey(tenantId, apiToken);
  const encryptedApiKey = JSON.stringify(encrypted);

  const rowsInserted = await withTenantRls(tenantId, (db) =>
    db
      .insert(janitorAccounts)
      .values({
        tenantId,
        provider,
        accountName,
        scopesVerified: probe.verified,
        encryptedApiKey,
        scanSchedule,
      })
      .onConflictDoUpdate({
        target: [janitorAccounts.tenantId, janitorAccounts.accountName, janitorAccounts.provider],
        set: {
          encryptedApiKey,
          scopesVerified: probe.verified,
          provider,
          scanSchedule,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: janitorAccounts.id,
        provider: janitorAccounts.provider,
        accountName: janitorAccounts.accountName,
        scopesVerified: janitorAccounts.scopesVerified,
        lastScanAt: janitorAccounts.lastScanAt,
        lastScanStatus: janitorAccounts.lastScanStatus,
        lastScanError: janitorAccounts.lastScanError,
        lastScanDiff: janitorAccounts.lastScanDiff,
        scanSchedule: janitorAccounts.scanSchedule,
        createdAt: janitorAccounts.createdAt,
      }),
  );
  const row = rowsInserted[0];
  if (!row) {
    return jsonError(500, "insert_failed", "janitor account upsert returned no rows", requestId);
  }

  await emitSaasAudit({
    tenantId,
    actorUserId: access.ctx.userId,
    action: "janitor.account.upsert",
    targetType: "janitor_account",
    targetId: row.id,
    metadata: { ...(requestId ? { request_id: requestId } : {}), provider },
  });

  return NextResponse.json({ account: row }, { headers: { "x-request-id": requestId } });
}
