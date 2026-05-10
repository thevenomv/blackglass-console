/**
 * Charon cleanup requests — queue, approve/reject, optional live cloud deletes.
 */

import { and, eq } from "drizzle-orm";
import { withTenantRls } from "@/db";
import { janitorAccounts, janitorCleanupRequests, janitorFindings, saasTenants } from "@/db/schema";
import { findingIsProtectTagged, mergedProtectTagMarkersLower, parseCharonPolicies } from "@/lib/janitor/charon-policies";
import { redactSensitivePlaintext } from "@/lib/janitor/charon-error-redact";
import { AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { JanitorCleanupBlockedError } from "@/lib/server/janitor/janitor-cleanup-blocked-error";
import { performLiveJanitorCleanup } from "@/lib/server/services/janitor-cleanup-executor";
import { emitSaasAudit } from "@/lib/saas/event-log";

/** Live delete failed after approval; `redactedDetail` is safe for API responses. */
export class JanitorCleanupExecutionError extends Error {
  readonly redactedDetail: string;
  constructor(redactedDetail: string) {
    super("janitor_cleanup_execution_failed");
    this.name = "JanitorCleanupExecutionError";
    this.redactedDetail = redactedDetail;
  }
}

export async function createJanitorCleanupRequests(
  tenantId: string,
  findingIds: string[],
  mode: "dry_run" | "live",
): Promise<string[]> {
  const created: string[] = [];
  await withTenantRls(tenantId, async (db) => {
    const [tenantRow] = await db
      .select({ charonPolicies: saasTenants.charonPolicies })
      .from(saasTenants)
      .where(eq(saasTenants.id, tenantId))
      .limit(1);
    const policy = parseCharonPolicies(tenantRow?.charonPolicies);

    for (const fid of findingIds) {
      const [finding] = await db
        .select({ id: janitorFindings.id, tags: janitorFindings.tags })
        .from(janitorFindings)
        .where(and(eq(janitorFindings.id, fid), eq(janitorFindings.tenantId, tenantId)))
        .limit(1);
      if (!finding) continue;
      if (
        mode === "live" &&
        findingIsProtectTagged(finding.tags ?? undefined, policy)
      ) {
        continue;
      }

      const [pending] = await db
        .select({ id: janitorCleanupRequests.id })
        .from(janitorCleanupRequests)
        .where(
          and(
            eq(janitorCleanupRequests.findingId, fid),
            eq(janitorCleanupRequests.tenantId, tenantId),
            eq(janitorCleanupRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (pending) continue;

      const [row] = await db
        .insert(janitorCleanupRequests)
        .values({
          tenantId,
          findingId: fid,
          mode,
          status: "pending",
        })
        .returning({ id: janitorCleanupRequests.id });
      if (row) created.push(row.id);
    }
  });
  return created;
}

export async function approveOrRejectJanitorCleanup(
  tenantId: string,
  requestId: string,
  action: "approve" | "reject",
  userId: string,
  opts: { liveCleanupAllowed: boolean },
): Promise<void> {
  await withTenantRls(tenantId, async (db) => {
    const [reqRow] = await db
      .select()
      .from(janitorCleanupRequests)
      .where(
        and(eq(janitorCleanupRequests.id, requestId), eq(janitorCleanupRequests.tenantId, tenantId)),
      )
      .limit(1);

    if (!reqRow || reqRow.status !== "pending") {
      throw new Error("invalid_cleanup_request");
    }

    if (action === "approve" && reqRow.mode === "live" && !opts.liveCleanupAllowed) {
      throw new Error("live_cleanup_forbidden");
    }

    if (action === "reject") {
      await db
        .update(janitorCleanupRequests)
        .set({
          status: "rejected",
          metadata: {
            ...reqRow.metadata,
            rejectedAt: new Date().toISOString(),
          },
        })
        .where(eq(janitorCleanupRequests.id, requestId));
      return;
    }

    const [finding] = await db
      .select()
      .from(janitorFindings)
      .where(eq(janitorFindings.id, reqRow.findingId))
      .limit(1);

    if (!finding) {
      throw new Error("finding_not_found");
    }

    const [account] = await db
      .select()
      .from(janitorAccounts)
      .where(
        and(eq(janitorAccounts.id, finding.accountId), eq(janitorAccounts.tenantId, tenantId)),
      )
      .limit(1);

    if (!account) {
      throw new Error("account_not_found");
    }

    const now = new Date();

    if (reqRow.mode === "live") {
      const [tenantPolicyRow] = await db
        .select({ charonPolicies: saasTenants.charonPolicies })
        .from(saasTenants)
        .where(eq(saasTenants.id, tenantId))
        .limit(1);
      const policy = parseCharonPolicies(tenantPolicyRow?.charonPolicies);
      if (findingIsProtectTagged(finding.tags ?? undefined, policy)) {
        await db
          .update(janitorCleanupRequests)
          .set({
            status: "failed",
            approvedByUserId: userId,
            approvedAt: now,
            executedAt: now,
            metadata: {
              ...reqRow.metadata,
              blockedByProtectTag: true,
              resourceType: finding.resourceType,
              resourceId: finding.resourceId,
            },
          })
          .where(eq(janitorCleanupRequests.id, requestId));
        await emitSaasAudit({
          tenantId,
          actorUserId: userId,
          action: AUDIT_ACTIONS.JANITOR_CLEANUP_BLOCKED_PROTECT_TAG,
          targetType: "janitor_cleanup",
          targetId: requestId,
          metadata: {
            resourceType: finding.resourceType,
            resourceId: finding.resourceId,
          },
        });
        throw new Error("cleanup_blocked_protected");
      }

      if (account.provider !== "do" && account.provider !== "aws" && account.provider !== "gcp") {
        throw new Error("live_cleanup_provider_unsupported");
      }
      try {
        await performLiveJanitorCleanup(
          tenantId,
          account.provider,
          account.encryptedApiKey,
          finding,
          mergedProtectTagMarkersLower(policy),
        );
      } catch (e) {
        if (e instanceof JanitorCleanupBlockedError) {
          await db
            .update(janitorCleanupRequests)
            .set({
              status: "failed",
              approvedByUserId: userId,
              approvedAt: now,
              executedAt: now,
              metadata: {
                ...reqRow.metadata,
                blockedByProtectTag: true,
                blockedByLiveTagCheck: true,
                resourceType: finding.resourceType,
                resourceId: finding.resourceId,
              },
            })
            .where(eq(janitorCleanupRequests.id, requestId));
          await emitSaasAudit({
            tenantId,
            actorUserId: userId,
            action: AUDIT_ACTIONS.JANITOR_CLEANUP_BLOCKED_PROTECT_TAG_LIVE,
            targetType: "janitor_cleanup",
            targetId: requestId,
            metadata: {
              resourceType: finding.resourceType,
              resourceId: finding.resourceId,
            },
          });
          throw new Error("cleanup_blocked_protected");
        }
        const raw = e instanceof Error ? e.message : String(e);
        const redacted = redactSensitivePlaintext(raw, 800);
        await db
          .update(janitorCleanupRequests)
          .set({
            status: "failed",
            approvedByUserId: userId,
            approvedAt: now,
            executedAt: now,
            metadata: {
              ...reqRow.metadata,
              live: true,
              executionFailed: true,
              executionError: redacted,
              provider: account.provider,
              resourceType: finding.resourceType,
              resourceId: finding.resourceId,
            },
          })
          .where(eq(janitorCleanupRequests.id, requestId));
        await emitSaasAudit({
          tenantId,
          actorUserId: userId,
          action: AUDIT_ACTIONS.JANITOR_CLEANUP_EXECUTION_FAILED,
          targetType: "janitor_cleanup",
          targetId: requestId,
          metadata: {
            provider: account.provider,
            resourceType: finding.resourceType,
            error: redacted.slice(0, 400),
          },
        });
        throw new JanitorCleanupExecutionError(redacted);
      }
      await db.delete(janitorFindings).where(eq(janitorFindings.id, finding.id));
      await db
        .update(janitorCleanupRequests)
        .set({
          status: "executed",
          approvedByUserId: userId,
          approvedAt: now,
          executedAt: now,
          metadata: {
            ...reqRow.metadata,
            live: true,
            provider: account.provider,
            resourceType: finding.resourceType,
            resourceId: finding.resourceId,
          },
        })
        .where(eq(janitorCleanupRequests.id, requestId));
      return;
    }

    const simulatedAction = `Dry-run: would call ${account.provider} delete for ${finding.resourceType} ${finding.resourceId} (${finding.resourceName})`;
    await db
      .update(janitorCleanupRequests)
      .set({
        status: "executed",
        approvedByUserId: userId,
        approvedAt: now,
        executedAt: now,
        metadata: {
          ...reqRow.metadata,
          dryRun: true,
          simulatedAction,
        },
      })
      .where(eq(janitorCleanupRequests.id, requestId));
  });
}
