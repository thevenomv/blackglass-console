/**
 * Policy service — "must stay true" invariants per tenant.
 *
 * Policies are evaluated at the end of each drift scan.  If a policy condition
 * is violated (i.e., the current snapshot no longer matches the expected value),
 * a synthetic "policy_violation" drift event is injected with the configured
 * severity.
 *
 * Policy conditions match against a flat key path extracted from the HostSnapshot
 * (e.g. sshConfig.permitRootLogin, firewallStatus.active).
 */

import { withTenantRls, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import type { HostSnapshot } from "@/lib/server/collector/types";
import type { DriftCategory, DriftSeverity } from "@/data/mock/types";

const { saasHostPolicies } = schema;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Drift categories that policies may target — must match `DriftCategory` in mock/types. */
export const POLICY_CATEGORIES = [
  "ssh",
  "network_exposure",
  "firewall",
  "packages",
  "integrity",
  "identity",
  "privilege_escalation",
  "persistence",
] as const satisfies readonly DriftCategory[];

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

export interface PolicyRule {
  id: string;
  name: string;
  category: PolicyCategory;
  conditionKey: string;
  conditionValue: string;
  severity: DriftSeverity;
  enabled: boolean;
  createdAt: string;
  createdBy: string | null;
}

export interface PolicyViolation {
  policyId: string;
  policyName: string;
  category: PolicyCategory;
  severity: DriftSeverity;
  key: string;
  expected: string;
  actual: string;
}

function isPolicyCategory(value: string): value is PolicyCategory {
  return (POLICY_CATEGORIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listPolicies(tenantId: string): Promise<PolicyRule[]> {
  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select()
      .from(saasHostPolicies)
      .where(and(eq(saasHostPolicies.tenantId, tenantId), eq(saasHostPolicies.enabled, true))),
  );
  return rows.map(rowToRule);
}

export async function createPolicy(
  tenantId: string,
  input: Omit<PolicyRule, "id" | "createdAt">,
): Promise<PolicyRule> {
  const [row] = await withTenantRls(tenantId, (db) =>
    db
      .insert(saasHostPolicies)
      .values({
        tenantId,
        name: input.name,
        category: input.category,
        conditionKey: input.conditionKey,
        conditionValue: input.conditionValue,
        severity: input.severity,
        enabled: input.enabled,
        createdBy: input.createdBy,
      })
      .returning(),
  );
  return rowToRule(row!);
}

export async function deletePolicy(tenantId: string, policyId: string): Promise<boolean> {
  const result = await withTenantRls(tenantId, (db) =>
    db
      .delete(saasHostPolicies)
      .where(and(eq(saasHostPolicies.id, policyId), eq(saasHostPolicies.tenantId, tenantId)))
      .returning({ id: saasHostPolicies.id }),
  );
  return result.length > 0;
}

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

/**
 * Extracts a value from a HostSnapshot by a dot-delimited key path.
 * e.g. "sshConfig.permitRootLogin" → "yes" | "no" | undefined
 */
function extractValue(snapshot: HostSnapshot, keyPath: string): string | undefined {
  const parts = keyPath.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obj: unknown = snapshot as unknown;
  for (const part of parts) {
    if (obj === null || typeof obj !== "object") return undefined;
    obj = (obj as Record<string, unknown>)[part];
  }
  if (obj === undefined || obj === null) return undefined;
  return String(obj);
}

/**
 * Evaluate a set of policy rules against a live host snapshot.
 * Returns violations where the snapshot does not match the expected value.
 */
export function evaluatePolicies(
  policies: PolicyRule[],
  snapshot: HostSnapshot,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const policy of policies) {
    const actual = extractValue(snapshot, policy.conditionKey);
    if (actual === undefined) continue; // key not present — skip (not a violation)
    if (actual !== policy.conditionValue) {
      violations.push({
        policyId: policy.id,
        policyName: policy.name,
        category: policy.category,
        severity: policy.severity,
        key: policy.conditionKey,
        expected: policy.conditionValue,
        actual,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToRule(row: typeof saasHostPolicies.$inferSelect): PolicyRule {
  const category: PolicyCategory = isPolicyCategory(row.category)
    ? row.category
    : "integrity"; // safe fallback for legacy rows with unrecognised categories
  return {
    id: row.id,
    name: row.name,
    category,
    conditionKey: row.conditionKey,
    conditionValue: row.conditionValue,
    severity: row.severity as DriftSeverity,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}
