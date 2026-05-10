/**
 * Tenant Charon policies stored in `saas_tenants.charon_policies` (JSON).
 */

/** Lowercase markers matched against finding tag keys/values — never live-deleted by Charon. */
export const CHARON_BUILTIN_PROTECT_MARKERS_LOWER = [
  "production",
  "prod",
  "critical",
  "do-not-delete",
  "blackglass-protected",
] as const;

export type CharonPolicyJson = {
  /** Tag keys (lowercase) — findings carrying any of these tags are dropped. */
  excludeTagsLower?: string[];
  /** Extra protector tag keys (lowercase) merged with built-in protector list. */
  protectTagsExtraLower?: string[];
  /** Drop findings below this idle score (1–100). */
  minIdleScore?: number;
  /** When true, send a short email to `saas_tenant_notifications.alert_email_to` after scans with findings. */
  emailDigestOnScan?: boolean;
  /** When true, POST a signed JSON payload to tenant `webhook_urls` after every successful Charon scan (see `charon.scan.completed`). */
  webhookOnScan?: boolean;
};

export type ResolvedCharonPolicies = {
  excludeTagsLower: string[];
  protectTagsExtraLower: string[];
  minIdleScore: number | null;
  emailDigestOnScan: boolean;
  webhookOnScan: boolean;
};

export function parseCharonPolicies(raw: unknown): ResolvedCharonPolicies {
  const d = raw && typeof raw === "object" ? (raw as CharonPolicyJson) : {};
  const exclude = Array.isArray(d.excludeTagsLower)
    ? d.excludeTagsLower.filter((x): x is string => typeof x === "string").map((s) => s.toLowerCase())
    : [];
  const protectExtra = Array.isArray(d.protectTagsExtraLower)
    ? d.protectTagsExtraLower.filter((x): x is string => typeof x === "string").map((s) => s.toLowerCase())
    : [];
  const minIdle =
    typeof d.minIdleScore === "number" && Number.isFinite(d.minIdleScore)
      ? Math.max(0, Math.min(100, Math.floor(d.minIdleScore)))
      : null;
  return {
    excludeTagsLower: exclude,
    protectTagsExtraLower: protectExtra,
    minIdleScore: minIdle,
    emailDigestOnScan: d.emailDigestOnScan === true,
    webhookOnScan: d.webhookOnScan === true,
  };
}

function tagHaystack(tags: Record<string, string> | undefined): string[] {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(tags ?? {})) {
    parts.push(k.toLowerCase(), v.toLowerCase());
  }
  return parts;
}

export function findingMatchesExcludeTags(
  tags: Record<string, string> | undefined,
  excludeLower: string[],
): boolean {
  if (!excludeLower.length) return false;
  const hay = tagHaystack(tags);
  return excludeLower.some((ex) => hay.includes(ex));
}

export function findingMatchesProtectTags(
  tags: Record<string, string> | undefined,
  protectLower: string[],
): boolean {
  if (!protectLower.length) return false;
  const hay = tagHaystack(tags);
  return protectLower.some((p) => hay.includes(p));
}

/** Built-in protectors + tenant `protectTagsExtraLower` (for scan filtering + cleanup guardrails). */
export function mergedProtectTagMarkersLower(policy: ResolvedCharonPolicies): string[] {
  return [...CHARON_BUILTIN_PROTECT_MARKERS_LOWER, ...policy.protectTagsExtraLower];
}

/** True if this finding must not be live-deleted (tag keys/values vs merged protector list). */
export function findingIsProtectTagged(
  tags: Record<string, string> | undefined,
  policy: ResolvedCharonPolicies,
): boolean {
  return findingMatchesProtectTags(tags, mergedProtectTagMarkersLower(policy));
}
