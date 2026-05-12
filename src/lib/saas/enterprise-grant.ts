import type { SaasSubscription } from "@/db/schema";
import { getPlanDefinition } from "@/lib/saas/plans";

/**
 * Operator-controlled Enterprise effective subscription at read time (without
 * mutating Stripe or `saas_subscriptions`).
 *
 * Set `BLACKGLASS_ENTERPRISE_GRANT_EMAILS` (comma-separated Clerk user emails).
 * For agent ingest + background jobs (no Clerk session), also set
 * `BLACKGLASS_ENTERPRISE_GRANT_TENANT_IDS` to the workspace UUID (see SaaS context JSON).
 */

function normalizeEmailList(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw?.trim()) return out;
  for (const part of raw.split(",")) {
    const e = part.trim().toLowerCase();
    if (e) out.add(e);
  }
  return out;
}

function normalizeTenantIdList(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw?.trim()) return out;
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (id) out.add(id);
  }
  return out;
}

function envEnterpriseGrantEmails(): Set<string> {
  return normalizeEmailList(process.env.BLACKGLASS_ENTERPRISE_GRANT_EMAILS);
}

function envEnterpriseGrantTenantIds(): Set<string> {
  return normalizeTenantIdList(process.env.BLACKGLASS_ENTERPRISE_GRANT_TENANT_IDS);
}

function emailMatchesGrant(grantEmails: Set<string>, userEmails?: readonly string[]): boolean {
  if (!userEmails?.length) return false;
  return userEmails.some((e) => grantEmails.has(String(e).trim().toLowerCase()));
}

/**
 * When a grant matches, return a copy of the row with Enterprise limits and an
 * operational `active` status so trial read-only and billing glitches never
 * block the workspace.
 */
export function applyEnterpriseSubscriptionGrant(
  sub: SaasSubscription,
  tenantId: string,
  grantUserEmails?: readonly string[],
): SaasSubscription {
  const tenantGrants = envEnterpriseGrantTenantIds();
  const emailGrants = envEnterpriseGrantEmails();
  const match =
    tenantGrants.has(tenantId.trim().toLowerCase()) || emailMatchesGrant(emailGrants, grantUserEmails);
  if (!match) return sub;

  const def = getPlanDefinition("enterprise");
  if (!def) return sub;

  return {
    ...sub,
    planCode: "enterprise",
    status: "active",
    trialEndsAt: null,
    hostLimit: def.hostLimit,
    paidSeatLimit: def.paidSeatLimit,
  };
}
