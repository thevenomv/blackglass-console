import { randomUUID } from "node:crypto";
import {
  collectorHasHostSlots,
  collectorHostSlotCount,
  collectorMaxParallelSsh,
} from "@/lib/server/collector-env";
import { logCollectorEvent } from "@/lib/server/collector-events";
import { mapPool } from "@/lib/server/async-pool";
import {
  runWithCollectorCredential,
  type ScanContext,
  type SshAuthConfig,
} from "@/lib/server/secrets";
import type { CollectScanOptions, HostSnapshot } from "./types";
import { allSshConfigs, runCollection } from "./ssh";

function scanContext(opts?: CollectScanOptions): ScanContext {
  return {
    scanId: opts?.scanId ?? randomUUID(),
    reason: opts?.reason ?? "drift_scan",
    hostCount: collectorHostSlotCount(),
    credentialRef: process.env.BLACKGLASS_SSH_SECRET_NAME,
    filterHostIds: opts?.hostIds?.length ? opts.hostIds : undefined,
  };
}

const COLLECTION_TIMEOUT_MS = 20_000;

async function collectAllSnapshotsWithAuth(
  auth: SshAuthConfig,
  ctx: ScanContext,
): Promise<Array<{ snapshot?: HostSnapshot; error?: string; hostId: string }>> {
  const cfgs = allSshConfigs(auth, ctx.filterHostIds);
  if (!cfgs.length) {
    throw new Error(
      ctx.filterHostIds?.length
        ? "No collector hosts match the requested host_ids"
        : "No collector hosts configured",
    );
  }

  const parallel = collectorMaxParallelSsh();
  const t0 = Date.now();
  logCollectorEvent("collector.collection.start", {
    scan_id: ctx.scanId,
    reason: ctx.reason,
    host_count: cfgs.length,
    parallel_ssh: parallel,
  });

  const timeout = (hostId: string) =>
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`SSH collection timed out for ${hostId}`)),
        COLLECTION_TIMEOUT_MS,
      ),
    );

  const results = await mapPool(cfgs, parallel, async (cfg) => {
    try {
      const snapshot = await Promise.race([runCollection(cfg), timeout(cfg.hostId)]);
      return { snapshot, hostId: cfg.hostId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logCollectorEvent("collector.ssh.error", {
        scan_id: ctx.scanId,
        host_id: cfg.hostId,
        error: errorMsg,
      });
      return {
        hostId: cfg.hostId,
        error: errorMsg,
      };
    }
  });

  const ok = results.filter((r) => r.snapshot).length;
  const fail = results.filter((r) => r.error).length;
  logCollectorEvent("collector.collection.complete", {
    scan_id: ctx.scanId,
    reason: ctx.reason,
    duration_ms: Date.now() - t0,
    hosts_ok: ok,
    hosts_failed: fail,
  });

  return results;
}

/** Collect a live snapshot from COLLECTOR_HOST_1. Throws on SSH error. */
export async function collectSnapshot(opts?: CollectScanOptions): Promise<HostSnapshot> {
  if (!collectorHasHostSlots()) throw new Error("COLLECTOR_HOST_1 env var not set");
  const ctx = scanContext(opts);
  return runWithCollectorCredential(ctx, async (auth) => {
    const cfgs = allSshConfigs(auth, ctx.filterHostIds);
    const first = cfgs[0];
    if (!first) throw new Error("COLLECTOR_HOST_1 env var not set");

    const t0 = Date.now();
    logCollectorEvent("collector.collection.start", {
      scan_id: ctx.scanId,
      reason: ctx.reason,
      host_count: 1,
      parallel_ssh: 1,
      host_id: first.hostId,
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`SSH collection timed out after ${COLLECTION_TIMEOUT_MS / 1000}s`)),
        COLLECTION_TIMEOUT_MS,
      ),
    );

    try {
      const snapshot = await Promise.race([runCollection(first), timeout]);
      logCollectorEvent("collector.collection.complete", {
        scan_id: ctx.scanId,
        reason: ctx.reason,
        duration_ms: Date.now() - t0,
        hosts_ok: 1,
        hosts_failed: 0,
        host_id: first.hostId,
      });
      return snapshot;
    } catch (e) {
      logCollectorEvent("collector.collection.complete", {
        scan_id: ctx.scanId,
        reason: ctx.reason,
        duration_ms: Date.now() - t0,
        hosts_ok: 0,
        hosts_failed: 1,
        host_id: first.hostId,
        error: e instanceof Error ? e.name : "Error",
        message:
          e instanceof Error
            ? e.message.slice(0, 240)
            : String(e).slice(0, 240),
      });
      throw e;
    }
  });
}

/**
 * Collect live snapshots from ALL configured COLLECTOR_HOST_N hosts in
 * parallel. Each result is a { snapshot, error } pair — a per-host failure
 * does not abort the others.
 */
export async function collectAllSnapshots(
  opts?: CollectScanOptions,
): Promise<Array<{ snapshot?: HostSnapshot; error?: string; hostId: string }>> {
  if (!collectorHasHostSlots()) throw new Error("No collector hosts configured");
  const ctx = scanContext(opts);
  return runWithCollectorCredential(ctx, (auth) => collectAllSnapshotsWithAuth(auth, ctx));
}
