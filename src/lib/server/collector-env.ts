/** Host slots `COLLECTOR_HOST_1` … `COLLECTOR_HOST_9` (first gap stops). No SSH imports. */

export function collectorHostSlotCount(): number {
  let n = 0;
  for (let i = 1; i <= 9; i++) {
    if (!process.env[`COLLECTOR_HOST_${i}`]) break;
    n++;
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
  return Math.max(1, Math.min(32, Math.floor(n)));
}

/** Canonical `hostId` values for each `COLLECTOR_HOST_N` (matches SSH collector `hostId`). */
export function configuredCollectorHostIds(): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const host = process.env[`COLLECTOR_HOST_${i}`]?.trim();
    if (!host) break;
    ids.push(`host-${host.replace(/\./g, "-")}`);
  }
  return ids;
}
