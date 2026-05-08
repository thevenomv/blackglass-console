/**
 * BYOK control plane for the current tenant.
 *
 *   GET    /api/v1/settings/byok              — redacted status
 *   POST   /api/v1/settings/byok              — { provider, keyRef, verify? } upsert (+ optional immediate verify)
 *   POST   /api/v1/settings/byok/verify       — round-trip the existing config (separate route file)
 *   DELETE /api/v1/settings/byok              — disable (soft; row retained for audit)
 *
 * Auth: owner / admin only (`secrets.manage`). Same gate as the other
 * admin-status endpoints. Legacy single-tenant deployments cannot
 * configure BYOK (no tenant id) so POST/DELETE return 400.
 *
 * Never returns secret material in any response. The `keyRef` IS
 * surfaced (it's an opaque public identifier — AWS KMS Key ARN /
 * Vault Transit key name — and the operator already knows it).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import {
  byokEnabled,
  disableTenantKmsConfig,
  tenantKmsStatus,
  upsertTenantKmsConfig,
  verifyTenantKms,
} from "@/lib/server/secrets/tenant-kms";
import {
  jsonError,
  readJsonBodyOptional,
  zodErrorResponse,
} from "@/lib/server/http/json-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ByokWriteSchema = z.object({
  provider: z.union([z.literal("awskms"), z.literal("vault")]),
  // KMS Key ARN can be ~256 chars; Vault Transit names are short. Cap
  // at 512 to keep the column reasonable but accept anything realistic.
  keyRef: z.string().min(1).max(512),
  /** When true, immediately round-trip after upsert. Defaults to true. */
  verify: z.boolean().optional(),
});

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const access = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!access.ok) return access.response;

  if (access.mode === "legacy") {
    return NextResponse.json(
      {
        byokEnabled: byokEnabled(),
        configured: false,
        provider: null,
        keyRef: null,
        lastVerifiedAt: null,
        lastVerifyError: null,
      },
      { headers: { "x-request-id": requestId } },
    );
  }

  const status = await tenantKmsStatus(access.ctx.tenant.id);
  return NextResponse.json(status, {
    headers: { "x-request-id": requestId },
  });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const access = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      400,
      "not_supported",
      "BYOK requires SaaS / multi-tenant mode.",
      requestId,
    );
  }
  if (!byokEnabled()) {
    return jsonError(
      400,
      "byok_disabled",
      "BYOK_ENABLED is not set on this deployment. Ask an operator to flip the flag first.",
      requestId,
    );
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;
  const parsed = ByokWriteSchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  await upsertTenantKmsConfig(access.ctx.tenant.id, {
    provider: parsed.data.provider,
    keyRef: parsed.data.keyRef.trim(),
  });

  // Default verify=true so the operator gets immediate feedback. They
  // can pass verify=false to defer (rare — useful when configuring
  // BYOK from a script that handles verify in a follow-up step).
  const shouldVerify = parsed.data.verify !== false;
  let verify: Awaited<ReturnType<typeof verifyTenantKms>> | null = null;
  if (shouldVerify) {
    verify = await verifyTenantKms(access.ctx.tenant.id);
  }

  const status = await tenantKmsStatus(access.ctx.tenant.id);
  return NextResponse.json(
    { ok: true, status, verify },
    { headers: { "x-request-id": requestId } },
  );
}

export async function DELETE(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const access = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!access.ok) return access.response;
  if (access.mode === "legacy") {
    return jsonError(
      400,
      "not_supported",
      "BYOK requires SaaS / multi-tenant mode.",
      requestId,
    );
  }

  await disableTenantKmsConfig(access.ctx.tenant.id);
  const status = await tenantKmsStatus(access.ctx.tenant.id);
  return NextResponse.json(
    { ok: true, status },
    { headers: { "x-request-id": requestId } },
  );
}
