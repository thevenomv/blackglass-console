/**
 * Shared Charon scan enqueue / inline execution for any linked provider.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withTenantRls } from "@/db";
import { janitorAccounts } from "@/db/schema";
import { jsonError } from "@/lib/server/http/json-error";
import { enqueueJanitorScanJob } from "@/lib/server/queue/janitor-queue";
import { executeJanitorScanJob } from "@/lib/server/services/janitor-scan-job";
import { emitSaasAudit } from "@/lib/saas/event-log";

export async function dispatchJanitorAccountScan(opts: {
  tenantId: string;
  accountId: string;
  requestId: string;
  actorUserId: string | null;
}): Promise<NextResponse> {
  const { tenantId, accountId, requestId, actorUserId } = opts;

  const rows = await withTenantRls(tenantId, (db) =>
    db
      .select({ id: janitorAccounts.id, provider: janitorAccounts.provider })
      .from(janitorAccounts)
      .where(and(eq(janitorAccounts.id, accountId), eq(janitorAccounts.tenantId, tenantId)))
      .limit(1),
  );
  const acc = rows[0];
  if (!acc) {
    return jsonError(404, "not_found", "Janitor account not found.", requestId);
  }

  const payload = {
    tenantId,
    accountId,
    requestId,
    actorUserId,
  };

  const queued = await enqueueJanitorScanJob(payload);

  await emitSaasAudit({
    tenantId,
    actorUserId,
    action: "janitor.scan.requested",
    targetType: "janitor_account",
    targetId: accountId,
    metadata: {
      ...(requestId ? { request_id: requestId } : {}),
      dispatch: queued ? "queued" : "inline",
      provider: acc.provider,
    },
  });

  if (!queued) {
    try {
      await executeJanitorScanJob(payload);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(502, "janitor_scan_failed", message.slice(0, 500), requestId);
    }
    return NextResponse.json(
      {
        status: "completed",
        mode: "inline",
        provider: acc.provider,
      },
      { headers: { "x-request-id": requestId } },
    );
  }

  return NextResponse.json(
    { status: "queued", mode: "bullmq", provider: acc.provider },
    { headers: { "x-request-id": requestId } },
  );
}
