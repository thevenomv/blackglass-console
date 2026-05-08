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
import { getBaseline } from "@/lib/server/baseline-store";
import type { CollectScanOptions, HostSnapshot } from "./types";
import { allSshConfigs, runCollection } from "./ssh";

/**
 * When SSH pull fails (DigitalOcean App Platform → Droplet egress is
 * silently blackholed by the DO network fabric, on-prem firewall blocks,
 * etc.), look for a recent agent-pushed snapshot in the baseline store
 * and use that instead. Window is bounded to avoid passing off a stale
 * snapshot as "live" for a failed scan.
 *
 * Default 15 min — same as the lab-health probe. Tunable via env so
 * air-gapped/daily-cadence customers don't trip a false fall-back.
 */
function getAgentFallbackWindowSeconds(): number {
  const raw = process.env.COLLECTOR_AGENT_FALLBACK_WINDOW_SECONDS
    ?? process.env.LAB_AGENT_FRESH_WINDOW_SECONDS;
  if (!raw) return 15 * 60;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60;
}

/**
 * Try to satisfy a "live collection" call from an agent-pushed snapshot
 * sitting in the baseline store. Returns the snapshot when fresh enough,
 * `null` otherwise. Never throws — failure here just means "no fallback
 * available" so the caller surfaces the original SSH error.
 */
async function tryAgentFallback(
  hostId: string,
  scanId: string,
): Promise<HostSnapshot | null> {
  try {
    const snapshot = await getBaseline(hostId);
    if (!snapshot?.collectedAt) return null;
    const collectedMs = Date.parse(snapshot.collectedAt);
    if (!Number.isFinite(collectedMs)) return null;
    const ageSeconds = Math.max(0, Math.round((Date.now() - collectedMs) / 1000));
    if (ageSeconds > getAgentFallbackWindowSeconds()) {
      logCollectorEvent("collector.agent_fallback.stale", {
        scan_id: scanId,
        host_id: hostId,
        age_seconds: ageSeconds,
        window_seconds: getAgentFallbackWindowSeconds(),
      });
      return null;
    }
    logCollectorEvent("collector.agent_fallback.hit", {
      scan_id: scanId,
      host_id: hostId,
      age_seconds: ageSeconds,
    });
    return snapshot;
  } catch (err) {
    logCollectorEvent("collector.agent_fallback.error", {
      scan_id: scanId,
      host_id: hostId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function scanContext(opts?: CollectScanOptions): ScanContext {
  return {
    scanId: opts?.scanId ?? randomUUID(),
    reason: opts?.reason ?? "drift_scan",
    hostCount: collectorHostSlotCount(),
    // opts.credentialRef overrides env — allows per-tenant credential labels in DB provider.
    credentialRef: opts?.credentialRef ?? process.env.BLACKGLASS_SSH_SECRET_NAME,
    filterHostIds: opts?.hostIds?.length ? opts.hostIds : undefined,
    tenantId: opts?.tenantId,
  };
}

// Per-host collection budget: TCP probe (4s) + SSH handshake (10s) + bundled script (up to 45s) = ~59s worst-case.
// Default of 75s gives headroom for slow systemctl/find on busy hosts. Override via COLLECTION_TIMEOUT_MS env var.
const COLLECTION_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.COLLECTION_TIMEOUT_MS ?? "75000", 10);
  // Clamp to [5 s, 120 s] to prevent hangs or false quick timeouts.
  return Number.isFinite(n) && n > 0 ? Math.max(5_000, Math.min(120_000, n)) : 25_000;
})();

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

  const results = await mapPool(cfgs, parallel, async (cfg) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), COLLECTION_TIMEOUT_MS);
    try {
      const snapshot = await runCollection(cfg, ac.signal);
      clearTimeout(timer);
      return { snapshot, hostId: cfg.hostId };
    } catch (err) {
      clearTimeout(timer);
      const errorMsg = err instanceof Error ? err.message : String(err);
      logCollectorEvent("collector.ssh.error", {
        scan_id: ctx.scanId,
        host_id: cfg.hostId,
        error: errorMsg,
      });
      // SSH pull failed — most often because DO App Platform's egress
      // to user-owned Droplets is blackholed. Before surfacing the error,
      // see if the push-agent left us a fresh snapshot we can use as a
      // drop-in substitute (the agent uses the SAME bundle format and
      // SAME parsers, so the resulting snapshot is byte-identical).
      const fallback = await tryAgentFallback(cfg.hostId, ctx.scanId);
      if (fallback) {
        return { snapshot: fallback, hostId: cfg.hostId };
      }
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

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), COLLECTION_TIMEOUT_MS);

    try {
      const snapshot = await runCollection(first, ac.signal);
      clearTimeout(timer);
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
      clearTimeout(timer);
      // Same agent fallback as collectAllSnapshotsWithAuth — see comment there.
      const fallback = await tryAgentFallback(first.hostId, ctx.scanId);
      if (fallback) {
        logCollectorEvent("collector.collection.complete", {
          scan_id: ctx.scanId,
          reason: ctx.reason,
          duration_ms: Date.now() - t0,
          hosts_ok: 1,
          hosts_failed: 0,
          host_id: first.hostId,
          fallback: "agent_push",
        });
        return fallback;
      }
      logCollectorEvent("collector.collection.complete", {
        scan_id: ctx.scanId,
        reason: ctx.reason,
        duration_ms: Date.now() - t0,
        hosts_ok: 0,
        hosts_failed: 1,
        host_id: first.hostId,
        error: e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : String(e).slice(0, 240),
        stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined,
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
