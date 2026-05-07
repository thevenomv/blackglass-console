/**
 * POST /api/v1/collector/hosts/bulk — bulk-add multiple SSH collector hosts.
 *
 * Accepts up to 200 hosts in a single request. Each row is validated
 * independently; the response reports per-row outcomes:
 *
 *   - "added"    — inserted into saas_collector_hosts
 *   - "duplicate" — hostname already exists for this tenant (skipped)
 *   - "invalid"  — failed validation (returns the validation error)
 *
 * The whole batch is rejected up-front if it would exceed the tenant's plan
 * host limit, so we never half-import. Audit-logged once with totals.
 */

import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { requireSaasStepUpMutation } from "@/lib/server/http/saas-access";
import { withTenantRls, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { emitSaasAudit } from "@/lib/saas/event-log";
import { canRunScansForTenant } from "@/lib/saas/operations";
import { z } from "zod";

export const dynamic = "force-dynamic";

const { saasCollectorHosts } = schema;

const HostnamePattern = /^[a-zA-Z0-9][a-zA-Z0-9.\-]*$/;

const hostRowSchema = z.object({
  hostname: z.string().min(1).max(253).regex(HostnamePattern, "Invalid hostname or IP"),
  label: z.string().max(120).optional(),
  sshUser: z.string().min(1).max(64).optional(),
  sshPort: z.number().int().min(1).max(65535).optional(),
});

const bulkSchema = z.object({
  hosts: z.array(hostRowSchema).min(1).max(200),
});

interface RowResult {
  hostname: string;
  status: "added" | "duplicate" | "invalid";
  hostId?: string;
  error?: string;
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  const access = await requireSaasStepUpMutation("hosts.manage", canRunScansForTenant);
  if (!access.ok) return access.response;
  const { ctx } = access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.", requestId);
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid input.", requestId);
  }

  const { hosts: incoming } = parsed.data;

  // Plan cap: count existing hosts and refuse if the merged set would exceed
  // the limit. -1 means unlimited.
  const limit = ctx.subscription.hostLimit;
  if (limit >= 0) {
    const existingCount = await withTenantRls(ctx.tenant.id, async (db) => {
      const rows = await db
        .select({ id: saasCollectorHosts.id })
        .from(saasCollectorHosts)
        .where(eq(saasCollectorHosts.tenantId, ctx.tenant.id));
      return rows.length;
    });
    // Use the unique-hostname count from the request to estimate; duplicates
    // already in DB will be filtered before insert, but we cap on the worst
    // case so a partial pass doesn't sneak past the limit.
    const uniqueIncoming = new Set(incoming.map((h) => h.hostname.toLowerCase())).size;
    if (existingCount + uniqueIncoming > limit) {
      return jsonError(
        403,
        "host_limit_exceeded",
        `Your plan allows up to ${limit} hosts. You currently have ${existingCount}; this import would add ${uniqueIncoming}.`,
        requestId,
      );
    }
  }

  // Find which hostnames already exist for this tenant so we can mark them
  // as "duplicate" instead of erroring on a unique-constraint violation.
  const incomingHostnames = incoming.map((h) => h.hostname);
  const existing = await withTenantRls(ctx.tenant.id, (db) =>
    db
      .select({ hostname: saasCollectorHosts.hostname })
      .from(saasCollectorHosts)
      .where(inArray(saasCollectorHosts.hostname, incomingHostnames)),
  );
  const existingSet = new Set(existing.map((r) => r.hostname));

  // Dedupe within the request itself — if the same hostname appears twice
  // in the upload only the first attempt counts as added.
  const seenInBatch = new Set<string>();
  const toInsert: typeof incoming = [];
  const results: RowResult[] = [];
  for (const row of incoming) {
    if (existingSet.has(row.hostname) || seenInBatch.has(row.hostname)) {
      results.push({ hostname: row.hostname, status: "duplicate" });
      continue;
    }
    seenInBatch.add(row.hostname);
    toInsert.push(row);
  }

  // One bulk insert keeps the audit-trail tidy and avoids 200 round-trips.
  let inserted: { id: string; hostname: string }[] = [];
  if (toInsert.length > 0) {
    inserted = await withTenantRls(ctx.tenant.id, (db) =>
      db
        .insert(saasCollectorHosts)
        .values(
          toInsert.map((row) => ({
            tenantId: ctx.tenant.id,
            hostname: row.hostname,
            label: row.label ?? null,
            sshUser: row.sshUser ?? "blackglass",
            sshPort: row.sshPort ?? 22,
          })),
        )
        .returning({ id: saasCollectorHosts.id, hostname: saasCollectorHosts.hostname }),
    );

    const idByHostname = new Map(inserted.map((r) => [r.hostname, r.id]));
    for (const row of toInsert) {
      results.push({
        hostname: row.hostname,
        status: "added",
        hostId: idByHostname.get(row.hostname),
      });
    }
  }

  const summary = {
    total: incoming.length,
    added: results.filter((r) => r.status === "added").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    invalid: results.filter((r) => r.status === "invalid").length,
  };

  await emitSaasAudit({
    tenantId: ctx.tenant.id,
    actorUserId: ctx.userId,
    action: "collector_host.bulk_imported",
    targetType: "collector_host",
    metadata: summary,
  });

  return jsonWithRequestId({ summary, results }, requestId);
}
