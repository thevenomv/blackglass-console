/** Host slots `COLLECTOR_HOST_1` … `COLLECTOR_HOST_9` (all non-empty slots counted). No SSH imports. */

export function collectorHostSlotCount(): number {
  let n = 0;
  for (let i = 1; i <= 9; i++) {
    if (process.env[`COLLECTOR_HOST_${i}`]) n++;
  }
  return n;
}

export function collectorHasHostSlots(): boolean {
  return Boolean(process.env.COLLECTOR_HOST_1);
}

export function collectorMaxParallelSsh(): number {
  const raw = process.env.COLLECTOR_MAX_PARALLEL_SSH;
  const n = raw != null && raw !== "" ? Number(raw) : 8;
  if (!Number.isFinite(n)) return 8;
  // Cap at 16 concurrent SSH connections to prevent file-descriptor exhaustion.
  const clamped = Math.max(1, Math.min(16, Math.floor(n)));
  if (Number.isFinite(n) && Math.floor(n) > 16) {
    console.warn(`[collector-env] COLLECTOR_MAX_PARALLEL_SSH=${Math.floor(n)} exceeds maximum of 16 — clamping.`);
  }
  return clamped;
}

/** Canonical `hostId` values for each `COLLECTOR_HOST_N` (matches SSH collector `hostId`). */
export function configuredCollectorHostIds(): string[] {
  const ids: string[] = [];
  // RFC 952/1123 hostname characters: alphanumerics and hyphens (no underscores, spaces, etc.)
  const validHostRe = /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/;
  for (let i = 1; i <= 9; i++) {
    const host = process.env[`COLLECTOR_HOST_${i}`]?.trim();
    if (!host) continue;
    if (!validHostRe.test(host)) {
      console.warn(`[collector-env] COLLECTOR_HOST_${i}="${host}" contains invalid hostname characters — skipping.`);
      continue;
    }
    ids.push(`host-${host.replace(/\./g, "-")}`);
  }
  return ids;
}
