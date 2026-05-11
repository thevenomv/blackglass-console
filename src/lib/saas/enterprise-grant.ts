import type { SaasSubscription } from "@/db/schema";
import { getPlanDefinition } from "@/lib/saas/plans";

/**
 * Founder / operator accounts that always resolve to an effective Enterprise
 * subscription at read time (without mutating Stripe or `saas_subscriptions`).
 *
 * Additional emails: `BLACKGLASS_ENTERPRISE_GRANT_EMAILS` (comma-separated).
 * For agent ingest + background jobs (no Clerk session), also set
 * `BLACKGLASS_ENTERPRISE_GRANT_TENANT_IDS` to the workspace UUID (see SaaS context JSON).
 */
const INTERNAL_ENTERPRISE_GRANT_EMAILS: ReadonlySet<string> = new Set(
  ["jamiesibley5@gmail.com"].map((e) => e.trim().toLowerCase()).filter(Boolean),
);

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
  const fromEnv = normalizeEmailList(process.env.BLACKGLASS_ENTERPRISE_GRANT_EMAILS);
  for (const e of INTERNAL_ENTERPRISE_GRANT_EMAILS) fromEnv.add(e);
  return fromEnv;
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
