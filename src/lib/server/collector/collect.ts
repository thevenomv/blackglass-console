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
import { getRecentAgentSnapshot } from "@/lib/server/agent-snapshot-cache";
import { updateScanProgress } from "@/lib/server/scan-jobs";
import type { CollectScanOptions, HostSnapshot } from "./types";
import { allSshConfigs, runCollection } from "./ssh";

/**
 * Max wall-clock seconds the SSH-fail fallback will wait for a fresh
 * agent push when the cached snapshot is older than the scan start.
 * Tunable via env so on-prem customers with longer agent intervals
 * can extend it without recompiling.
 *
 * Default 90s = ~1.5 × the new 60s agent timer interval, so a single
 * push cycle almost always lands within the wait window. With the
 * legacy 5min interval the wait is bounded by this value too — the
 * caller still gets a snapshot (the cached one) and the UI surfaces
 * a "data is N min old" affordance via `progressDetail`.
 */
function getFreshPushWaitMs(): number {
  const raw = process.env.COLLECTOR_AGENT_FRESH_WAIT_MS;
  if (!raw) return 90_000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(600_000, n) : 90_000;
}

/** Polling cadence while waiting for a fresh push (ms). */
const FRESH_PUSH_POLL_MS = 1_500;

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
 * Try to satisfy a "live collection" call from a recent push-agent
 * snapshot. Returns the snapshot when fresh enough, `null` otherwise.
 * Never throws — failure here just means "no fallback available" so
 * the caller surfaces the original SSH error.
 *
 * Two-stage freshness logic
 * -------------------------
 *   1. If `scanStartedAt` is provided AND the cached snapshot is older
 *      than that timestamp, the cached data was captured BEFORE the
 *      user clicked "Run scan" — meaning it cannot reflect any drift
 *      they introduced between baseline and click. We poll the cache
 *      for up to `COLLECTOR_AGENT_FRESH_WAIT_MS` looking for a newer
 *      push. This is the fix for "Run scan reports 100% baseline
 *      alignment despite live drift": with a 60s agent timer we get
 *      genuinely fresh data in <90s; with the legacy 5min timer we
 *      either land within the wait window or fall back to the
 *      cached pre-click snapshot but TELL the user (via progress
 *      detail) why they're seeing what they're seeing.
 *
 *   2. Otherwise (or after the wait expires) we fall back to the
 *      most recent snapshot in the cache, then to the baseline store
 *      (for the very first call after process restart — the cache
 *      hasn't repopulated yet but the baseline still exists).
 */
async function tryAgentFallback(
  hostId: string,
  scanId: string,
  scanStartedAt?: number,
): Promise<HostSnapshot | null> {
  const windowSeconds = getAgentFallbackWindowSeconds();
  try {
    // Stage 1: if we know when the scan started, prefer a snapshot
    // captured AFTER that moment. If the cache only has an older
    // snapshot, wait briefly for a fresh push.
    if (scanStartedAt) {
      const fresh = getRecentAgentSnapshot(hostId, windowSeconds);
      const isFreshEnough = (snap: HostSnapshot | null): boolean => {
        if (!snap?.collectedAt) return false;
        const t = Date.parse(snap.collectedAt);
        return Number.isFinite(t) && t >= scanStartedAt;
      };

      if (isFreshEnough(fresh)) {
        const t = Date.parse(fresh!.collectedAt);
        logCollectorEvent("collector.agent_fallback.hit", {
          scan_id: scanId,
          host_id: hostId,
          age_seconds: Math.max(0, Math.round((Date.now() - t) / 1000)),
          source: "cache_post_click",
        });
        return fresh;
      }

      const waitMs = getFreshPushWaitMs();
      const deadline = Date.now() + waitMs;
      // Surface the wait in the UI so the user understands why "Run
      // scan" is taking longer than the ~3s mock projection used to.
      updateScanProgress(scanId, "Waiting for fresh agent snapshot…");
      logCollectorEvent("collector.agent_fallback.wait_start", {
        scan_id: scanId,
        host_id: hostId,
        wait_ms: waitMs,
        scan_started_at: new Date(scanStartedAt).toISOString(),
      });

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, FRESH_PUSH_POLL_MS));
        const candidate = getRecentAgentSnapshot(hostId, windowSeconds);
        if (isFreshEnough(candidate)) {
          const t = Date.parse(candidate!.collectedAt);
          logCollectorEvent("collector.agent_fallback.wait_resolved", {
            scan_id: scanId,
            host_id: hostId,
            waited_ms: Date.now() - (deadline - waitMs),
            age_seconds: Math.max(0, Math.round((Date.now() - t) / 1000)),
          });
          updateScanProgress(scanId, "Snapshot received from agent…");
          return candidate;
        }

        // Update remaining-time hint every poll so the UI can show
        // "Waiting for fresh agent snapshot (47s remaining)…" — much
        // better than a silent stall.
        const remainingS = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        updateScanProgress(
          scanId,
          `Waiting for fresh agent snapshot (${remainingS}s remaining)…`,
        );
      }

      logCollectorEvent("collector.agent_fallback.wait_timeout", {
        scan_id: scanId,
        host_id: hostId,
        wait_ms: waitMs,
      });
      // Fall through to "use whatever's in the cache" — better to
      // return slightly stale data with a warning than to fail the
      // scan entirely. The caller (executeDriftScanJob) records this
      // and the dashboard's snapshot-age affordance flags it.
    }

    const cached = getRecentAgentSnapshot(hostId, windowSeconds);
    if (cached) {
      const collectedMs = Date.parse(cached.collectedAt ?? "");
      const ageSeconds = Number.isFinite(collectedMs)
        ? Math.max(0, Math.round((Date.now() - collectedMs) / 1000))
        : 0;
      logCollectorEvent("collector.agent_fallback.hit", {
        scan_id: scanId,
        host_id: hostId,
        age_seconds: ageSeconds,
        source: "cache",
        stale_relative_to_scan: scanStartedAt
          ? Number.isFinite(collectedMs) && collectedMs < scanStartedAt
          : false,
      });
      return cached;
    }

    const snapshot = await getBaseline(hostId);
    if (!snapshot?.collectedAt) return null;
    const collectedMs = Date.parse(snapshot.collectedAt);
    if (!Number.isFinite(collectedMs)) return null;
    const ageSeconds = Math.max(0, Math.round((Date.now() - collectedMs) / 1000));
    if (ageSeconds > windowSeconds) {
      logCollectorEvent("collector.agent_fallback.stale", {
        scan_id: scanId,
        host_id: hostId,
        age_seconds: ageSeconds,
        window_seconds: windowSeconds,
        source: "baseline",
      });
      return null;
    }
    logCollectorEvent("collector.agent_fallback.hit", {
      scan_id: scanId,
      host_id: hostId,
      age_seconds: ageSeconds,
      source: "baseline",
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

/**
 * Resolve the scanStartedAt that the SSH-fail fallback uses to decide
 * "is this cached snapshot from BEFORE the user clicked Run scan?".
 *
 * Returns `undefined` when the caller didn't opt in. This is
 * deliberate: only interactive callers (the user-facing /api/v1/scans
 * route) want the "wait for fresh push" behaviour — scheduled scans,
 * cron-driven sweeps, and tests should consume whatever is freshest in
 * the cache without blocking. Defaulting to `Date.now()` here would
 * make non-interactive callers wait the full
 * COLLECTOR_AGENT_FRESH_WAIT_MS window on every SSH failure, which is
 * the wrong semantics.
 */
function effectiveScanStartedAt(opts?: CollectScanOptions): number | undefined {
  return typeof opts?.scanStartedAt === "number" ? opts.scanStartedAt : undefined;
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
  scanStartedAt: number | undefined,
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
      const fallback = await tryAgentFallback(cfg.hostId, ctx.scanId, scanStartedAt);
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
  const scanStartedAt = effectiveScanStartedAt(opts);
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
      const fallback = await tryAgentFallback(first.hostId, ctx.scanId, scanStartedAt);
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
  const scanStartedAt = effectiveScanStartedAt(opts);
  return runWithCollectorCredential(ctx, (auth) =>
    collectAllSnapshotsWithAuth(auth, ctx, scanStartedAt),
  );
}
