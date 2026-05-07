import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import {
  requireTenantPermission,
  SaasAuthError,
  requireRecentPrimaryVerification,
  requireTenantAuth,
  type TenantAuthContext,
} from "@/lib/saas/auth-context";
import { canRunScansForTenant } from "@/lib/saas/operations";
import { jsonError } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import type { Role } from "@/lib/auth/permissions";
import { toLegacyApiRole } from "@/lib/saas/plans";
import type { SaasPermission } from "@/lib/saas/permissions";
import type { TenantRole } from "@/lib/saas/tenant-role";
import type { SaasSubscription } from "@/db/schema";
import { emitSaasAudit, emitSaasSecurity } from "@/lib/saas/event-log";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import {
  extractBearerToken,
  hasScope,
  resolveApiKey,
  type ApiKeyContext,
} from "@/lib/server/api-key-auth";

export type ScanAccess =
  | { ok: true; mode: "saas"; ctx: TenantAuthContext; legacyRole: Role }
  | { ok: true; mode: "legacy"; legacyRole: Role }
  | { ok: false; response: ReturnType<typeof jsonError> };

type OpGate = (
  role: TenantRole,
  subscription: SaasSubscription,
) => { ok: true } | { ok: false; code: string; detail: string };

function jsonForUnexpectedSaasError(requestId?: string) {
  return jsonError(
    500,
    "internal_error",
    "Authorization could not be completed. Try again or contact support.",
    requestId,
  );
}

function jsonForGate(
  gate: { ok: false; code: string; detail: string },
  requestId?: string,
) {
  const status =
    gate.code === "trial_read_only" || gate.code === "forbidden" || gate.code === "host_cap"
      ? 403
      : gate.code === "subscription_inactive"
        ? 402
        : 403;
  return jsonError(status, gate.code, gate.detail, requestId);
}

/** Enqueue drift scans — Clerk tenants use RBAC + trial rules; legacy uses cookie roles.  Bearer bg_live_* API keys with `scans.run` scope are accepted when a Request is provided. */
export async function requireScanEnqueueAccess(request?: Request): Promise<ScanAccess> {
  const requestId = request ? getOrCreateRequestId(request) : undefined;

  if (request) {
    const apiKeyAttempt = await tryApiKeyAccess(request, "scans.run");
    if (apiKeyAttempt) {
      if (!apiKeyAttempt.ok) return { ok: false, response: apiKeyAttempt.response };
      const gate = canRunScansForTenant(apiKeyAttempt.ctx.role, apiKeyAttempt.ctx.subscription);
      if (!gate.ok) {
        return { ok: false, response: jsonForGate(gate, requestId) };
      }
      return {
        ok: true,
        mode: "saas",
        ctx: apiKeyAttempt.ctx,
        legacyRole: toLegacyApiRole(apiKeyAttempt.ctx.role),
      };
    }
  }

  if (process.env.FEATURE_SCANS_DISABLED === "true") {
    if (isClerkAuthEnabled()) {
      try {
        const ctx = await requireTenantAuth();
        void emitSaasAudit({
          tenantId: ctx.tenant.id,
          actorUserId: ctx.userId,
          action: "scan.feature_disabled",
          targetType: "config",
          targetId: "FEATURE_SCANS_DISABLED",
          metadata: { ...(requestId ? { request_id: requestId } : {}) },
        });
      } catch {
        /* unauthenticated — omit audit */
      }
    }
    return {
      ok: false,
      response: jsonError(
        503,
        "scans_disabled",
        "Scan enqueue is temporarily disabled on this deployment.",
        requestId,
      ),
    };
  }
  if (isClerkAuthEnabled()) {
    try {
      const ctx = await requireTenantPermission("scans.run");
      const gate = canRunScansForTenant(ctx.role, ctx.subscription);
      if (!gate.ok) {
        void emitSaasAudit({
          tenantId: ctx.tenant.id,
          actorUserId: ctx.userId,
          action: "scan.blocked",
          targetType: "subscription",
          targetId: ctx.subscription.id,
          metadata: { code: gate.code, ...(requestId ? { request_id: requestId } : {}) },
        });
        if (gate.code === "trial_read_only") {
          void emitSaasSecurity({
            tenantId: ctx.tenant.id,
            userId: ctx.userId,
            severity: "low",
            eventType: "trial_blocked_scan",
            metadata: { ...(requestId ? { request_id: requestId } : {}) },
          });
        }
        return { ok: false, response: jsonForGate(gate, requestId) };
      }
      return {
        ok: true,
        mode: "saas",
        ctx,
        legacyRole: toLegacyApiRole(ctx.role),
      };
    } catch (e) {
      if (e instanceof SaasAuthError) {
        return {
          ok: false,
          response: jsonError(e.status, e.code, e.message, requestId),
        };
      }
      console.error("[saas-access] requireScanEnqueueAccess", e);
      return { ok: false, response: jsonForUnexpectedSaasError(requestId) };
    }
  }

  const g = await requireRole(["operator", "admin"]);
  if (!g.ok) return { ok: false, response: g.response };
  return { ok: true, mode: "legacy", legacyRole: g.role };
}

/**
 * Build a synthetic TenantAuthContext from an API key. The API key already
 * carries a tenantId; the rest is filled with defaults so downstream code
 * (which expects a TenantAuthContext) works unchanged.
 *
 * Loads the tenant + subscription rows under bypass-RLS — the request
 * presented a valid bearer token so the server is authorised to look them up.
 */
async function tenantContextForApiKey(
  apiKey: ApiKeyContext,
): Promise<TenantAuthContext | null> {
  const { tryGetDb, withBypassRls, schema } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  if (!tryGetDb()) return null;

  const tenantRows = await withBypassRls((db) =>
    db.select().from(schema.saasTenants).where(eq(schema.saasTenants.id, apiKey.tenantId)).limit(1),
  );
  const tenant = tenantRows[0];
  if (!tenant) return null;

  const subRows = await withBypassRls((db) =>
    db
      .select()
      .from(schema.saasSubscriptions)
      .where(eq(schema.saasSubscriptions.tenantId, apiKey.tenantId))
      .limit(1),
  );
  const subscription = subRows[0];
  if (!subscription) return null;

  return {
    userId: `api-key:${apiKey.keyId}`,
    orgId: tenant.clerkOrgId,
    tenant,
    role: "operator", // API keys act as operators by default; per-route scope check governs the rest
    subscription,
  };
}

/**
 * Try to authenticate via Authorization: Bearer bg_live_*.  Returns null if
 * the request is not presenting an API key, an error response if the key is
 * invalid/expired/missing-scope, and a TenantAuthContext on success.
 */
async function tryApiKeyAccess(
  request: Request | undefined,
  scope: string,
): Promise<
  | { ok: true; ctx: TenantAuthContext; apiKey: ApiKeyContext }
  | { ok: false; response: ReturnType<typeof jsonError> }
  | null
> {
  if (!request) return null;
  const token = extractBearerToken(request);
  if (!token) return null;

  const apiKey = await resolveApiKey(token);
  if (!apiKey) {
    return {
      ok: false,
      response: jsonError(401, "invalid_api_key", "API key is invalid or expired."),
    };
  }
  if (!hasScope(apiKey, scope)) {
    return {
      ok: false,
      response: jsonError(
        403,
        "missing_scope",
        `API key is missing required scope: ${scope}`,
      ),
    };
  }
  const ctx = await tenantContextForApiKey(apiKey);
  if (!ctx) {
    return {
      ok: false,
      response: jsonError(500, "tenant_unavailable", "Could not load tenant for API key."),
    };
  }
  return { ok: true, ctx, apiKey };
}

export async function requireSaasOrLegacyPermission(
  permission: SaasPermission,
  legacyAllowed: Role[],
  options?: {
    /** Pass the incoming Request to enable Bearer bg_live_* API-key auth. */
    request?: Request;
    /** Required API-key scope (default: derive from the permission name). */
    scope?: string;
  },
): Promise<
  | { ok: true; mode: "saas"; ctx: TenantAuthContext; apiKey?: ApiKeyContext }
  | { ok: true; mode: "legacy"; legacyRole: Role }
  | { ok: false; response: ReturnType<typeof jsonError> }
> {
  if (options?.request) {
    const scope = options.scope ?? permission;
    const apiKeyAttempt = await tryApiKeyAccess(options.request, scope);
    if (apiKeyAttempt) {
      if (!apiKeyAttempt.ok) return apiKeyAttempt;
      return {
        ok: true,
        mode: "saas",
        ctx: apiKeyAttempt.ctx,
        apiKey: apiKeyAttempt.apiKey,
      };
    }
  }

  if (isClerkAuthEnabled()) {
    try {
      const ctx = await requireTenantPermission(permission);
      return { ok: true, mode: "saas", ctx };
    } catch (e) {
      if (e instanceof SaasAuthError) {
        return { ok: false, response: jsonError(e.status, e.code, e.message) };
      }
      console.error("[saas-access] requireSaasOrLegacyPermission", e);
      return { ok: false, response: jsonForUnexpectedSaasError() };
    }
  }
  const g = await requireRole(legacyAllowed);
  if (!g.ok) return { ok: false, response: g.response };
  return { ok: true, mode: "legacy", legacyRole: g.role };
}

/**
 * Clerk SaaS mutation: permission + operational gate (trial / subscription).
 * Call only when `isClerkAuthEnabled()` is true; legacy callers use `requireRole`.
 */
export async function requireSaasOperationalMutation(
  permission: SaasPermission,
  gate: OpGate,
): Promise<
  | { ok: true; ctx: TenantAuthContext }
  | { ok: false; response: ReturnType<typeof jsonError> }
> {
  try {
    const ctx = await requireTenantPermission(permission);
    const g = gate(ctx.role, ctx.subscription);
    if (!g.ok) {
      return { ok: false, response: jsonForGate(g) };
    }
    return { ok: true, ctx };
  } catch (e) {
    if (e instanceof SaasAuthError) {
      return { ok: false, response: jsonError(e.status, e.code, e.message) };
    }
    console.error("[saas-access] requireSaasOperationalMutation", e);
    return { ok: false, response: jsonForUnexpectedSaasError() };
  }
}

export async function requireSaasStepUpMutation(
  permission: SaasPermission,
  gate: OpGate,
): Promise<
  | { ok: true; ctx: TenantAuthContext }
  | { ok: false; response: ReturnType<typeof jsonError> }
> {
  try {
    await requireRecentPrimaryVerification();
  } catch (e) {
    if (e instanceof SaasAuthError) {
      return { ok: false, response: jsonError(e.status, e.code, e.message) };
    }
    console.error("[saas-access] requireSaasStepUpMutation (verification)", e);
    return { ok: false, response: jsonForUnexpectedSaasError() };
  }
  return requireSaasOperationalMutation(permission, gate);
}
