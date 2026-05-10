/**
 * Optional tenant webhook when a Charon scan completes successfully.
 */

import type { CharonScanDiffStored } from "@/lib/janitor/charon-scan-diff";
import type { ResolvedCharonPolicies } from "@/lib/janitor/charon-policies";
import { dispatchTenantJsonWebhooks } from "@/lib/server/outbound-webhook";

export async function maybeDispatchCharonScanWebhook(opts: {
  tenantId: string;
  accountId: string;
  provider: string;
  policy: ResolvedCharonPolicies;
  scanId: string;
  findingsCount: number;
  diff: CharonScanDiffStored;
}): Promise<void> {
  if (!opts.policy.webhookOnScan) return;

  const dispatchedAt = new Date().toISOString();
  await dispatchTenantJsonWebhooks({
    tenantId: opts.tenantId,
    scanId: opts.scanId,
    payload: {
      schemaVersion: 1,
      dispatchedAt,
      event: "charon.scan.completed",
      scanId: opts.scanId,
      tenantId: opts.tenantId,
      /** Scan completion instant (domain); generic JSON webhooks also include `dispatchedAt` (emit time) like drift `timestamp`. */
      timestamp: opts.diff.scannedAt,
      accountId: opts.accountId,
      provider: opts.provider,
      findingsCount: opts.findingsCount,
      diff: {
        previousScannedAt: opts.diff.previousScannedAt,
        counts: opts.diff.counts,
        added: opts.diff.added,
        removed: opts.diff.removed,
        scoreChanged: opts.diff.scoreChanged,
      },
    },
  });
}
