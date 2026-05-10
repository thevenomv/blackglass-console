/**
 * Compare consecutive Charon scan snapshots (resource keys + idle scores).
 */

export type CharonSnapshotItemV1 = {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  idleScore: number;
};

export type CharonScanSnapshotV1 = {
  v: 1;
  scannedAt: string;
  items: CharonSnapshotItemV1[];
};

export type CharonScanDiffStored = {
  scannedAt: string;
  previousScannedAt: string | null;
  counts: { added: number; removed: number; scoreChanged: number };
  added: CharonSnapshotItemV1[];
  removed: CharonSnapshotItemV1[];
  scoreChanged: Array<
    CharonSnapshotItemV1 & { previousScore: number; currentScore: number }
  >;
};

const MAX_SNAPSHOT_ITEMS = 2500;
const MAX_DIFF_DETAIL = 40;

function rk(i: Pick<CharonSnapshotItemV1, "resourceType" | "resourceId">): string {
  return `${i.resourceType}|${i.resourceId}`;
}

export function parseCharonScanSnapshot(raw: unknown): CharonScanSnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !Array.isArray(o.items) || typeof o.scannedAt !== "string") return null;
  return o as CharonScanSnapshotV1;
}

export function buildCharonScanSnapshot(
  scannedAt: Date,
  rows: Array<{
    resourceType: string;
    resourceId: string;
    resourceName: string;
    idleScore: number;
  }>,
): CharonScanSnapshotV1 {
  const items = rows.slice(0, MAX_SNAPSHOT_ITEMS).map((r) => ({
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    resourceName: r.resourceName,
    idleScore: r.idleScore,
  }));
  return { v: 1, scannedAt: scannedAt.toISOString(), items };
}

export function diffCharonScanSnapshots(
  previous: CharonScanSnapshotV1 | null,
  current: CharonScanSnapshotV1,
): CharonScanDiffStored {
  const prevMap = new Map<string, CharonSnapshotItemV1>();
  for (const it of previous?.items ?? []) {
    prevMap.set(rk(it), it);
  }
  const curMap = new Map<string, CharonSnapshotItemV1>();
  for (const it of current.items) {
    curMap.set(rk(it), it);
  }

  const addedFull: CharonSnapshotItemV1[] = [];
  const removedFull: CharonSnapshotItemV1[] = [];
  const changedFull: Array<
    CharonSnapshotItemV1 & { previousScore: number; currentScore: number }
  > = [];

  for (const [k, cur] of curMap) {
    const p = prevMap.get(k);
    if (!p) {
      addedFull.push(cur);
    } else if (p.idleScore !== cur.idleScore) {
      changedFull.push({
        ...cur,
        previousScore: p.idleScore,
        currentScore: cur.idleScore,
      });
    }
  }
  for (const [k, p] of prevMap) {
    if (!curMap.has(k)) removedFull.push(p);
  }

  return {
    scannedAt: current.scannedAt,
    previousScannedAt: previous?.scannedAt ?? null,
    counts: {
      added: addedFull.length,
      removed: removedFull.length,
      scoreChanged: changedFull.length,
    },
    added: addedFull.slice(0, MAX_DIFF_DETAIL),
    removed: removedFull.slice(0, MAX_DIFF_DETAIL),
    scoreChanged: changedFull.slice(0, MAX_DIFF_DETAIL),
  };
}
