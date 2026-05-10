/**
 * Free Cloud Inventory Diff Visualiser — pure, browser-safe diff engine.
 *
 * Same boundaries as the other free tools:
 *   - Pure functions, no I/O.
 *   - Same simplified JSON shape Charon emits, surfaced in the page.
 *   - Structural diff only (added / removed / changed) — no cost analysis,
 *     no idle scoring; Charon does those with live signal you don't get
 *     from a static inventory file.
 *   - Tolerant of missing fields and unknown resource kinds.
 *
 * Diff key is `(kind, id)` — the smallest stable identity in the schema.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Provider = "do" | "aws" | "gcp" | "other";

/** Loose resource shape — only `kind` and `id` are required. */
export interface InventoryResource {
  kind: string;
  id: string;
  [key: string]: unknown;
}

export interface InventorySnapshot {
  snapshot_id?: string;
  captured_at?: string;
  provider?: Provider | string;
  resources: InventoryResource[];
}

export type ChangeOperation = "added" | "removed" | "changed";

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ResourceDiff {
  kind: string;
  id: string;
  op: ChangeOperation;
  /** Only populated when `op === "changed"`. */
  changes?: FieldChange[];
  /** Snapshot of the resource before the change (removed + changed). */
  before?: InventoryResource;
  /** Snapshot of the resource after the change (added + changed). */
  after?: InventoryResource;
}

export interface DiffSummary {
  totals: { added: number; removed: number; changed: number };
  /** Per-kind tallies — useful for the "9 droplets removed" header line. */
  byKind: Array<{
    kind: string;
    added: number;
    removed: number;
    changed: number;
  }>;
  diffs: ResourceDiff[];
  /** Snapshot metadata pulled through for the result header. */
  meta: {
    before: { snapshot_id?: string; captured_at?: string; provider?: string };
    after: { snapshot_id?: string; captured_at?: string; provider?: string };
  };
  /** Human-readable provider mismatch warnings, if any. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Validation / parse
// ---------------------------------------------------------------------------

export class InventoryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryParseError";
  }
}

/**
 * Parse a string of JSON into an `InventorySnapshot`. Throws
 * `InventoryParseError` with a short, user-safe message on any failure.
 */
export function parseInventory(jsonText: string): InventorySnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new InventoryParseError("File is not valid JSON.");
  }
  if (!isPlainObject(parsed)) {
    throw new InventoryParseError("Top-level value must be a JSON object.");
  }
  const resourcesRaw = (parsed as Record<string, unknown>).resources;
  if (!Array.isArray(resourcesRaw)) {
    throw new InventoryParseError(
      'Missing or invalid "resources" array. See the schema below.',
    );
  }
  const resources: InventoryResource[] = [];
  for (const r of resourcesRaw) {
    if (!isPlainObject(r)) continue;
    const kind = (r as Record<string, unknown>).kind;
    const id = (r as Record<string, unknown>).id;
    if (typeof kind !== "string" || typeof id !== "string" || !id.length) {
      // Skip resources missing the identity pair — be tolerant rather than fail
      // the whole parse for one bad row.
      continue;
    }
    resources.push({ ...(r as Record<string, unknown>), kind, id } as InventoryResource);
  }
  if (resources.length === 0) {
    throw new InventoryParseError(
      "No valid resources found — every resource needs a string `kind` and `id`.",
    );
  }
  return {
    snapshot_id: pickString(parsed, "snapshot_id"),
    captured_at: pickString(parsed, "captured_at"),
    provider: pickString(parsed, "provider"),
    resources,
  };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

const COMPARED_FIELDS = [
  "region",
  "size",
  "size_gb",
  "tags",
  "attached_to",
  "name",
  "image",
  "state",
  "private_ip",
  "public_ip",
  "created_at",
] as const;

/**
 * Diff two parsed inventory snapshots. Order matters: `before` is the
 * baseline, `after` is the newer snapshot.
 */
export function diffInventories(
  before: InventorySnapshot,
  after: InventorySnapshot,
): DiffSummary {
  const beforeIndex = indexResources(before.resources);
  const afterIndex = indexResources(after.resources);

  const diffs: ResourceDiff[] = [];

  for (const [key, b] of beforeIndex) {
    const a = afterIndex.get(key);
    if (!a) {
      diffs.push({ kind: b.kind, id: b.id, op: "removed", before: b });
      continue;
    }
    const changes = compareFields(b, a);
    if (changes.length > 0) {
      diffs.push({
        kind: b.kind,
        id: b.id,
        op: "changed",
        changes,
        before: b,
        after: a,
      });
    }
  }
  for (const [key, a] of afterIndex) {
    if (!beforeIndex.has(key)) {
      diffs.push({ kind: a.kind, id: a.id, op: "added", after: a });
    }
  }

  // Sort: changes first (they're the most interesting), then removed, then
  // added. Within each group, sort by kind then id for stable output.
  const order: Record<ChangeOperation, number> = { changed: 0, removed: 1, added: 2 };
  diffs.sort((x, y) => {
    if (order[x.op] !== order[y.op]) return order[x.op] - order[y.op];
    if (x.kind !== y.kind) return x.kind.localeCompare(y.kind);
    return x.id.localeCompare(y.id);
  });

  const totals = { added: 0, removed: 0, changed: 0 };
  const kindMap = new Map<string, { added: number; removed: number; changed: number }>();
  for (const d of diffs) {
    totals[d.op] += 1;
    const k = kindMap.get(d.kind) ?? { added: 0, removed: 0, changed: 0 };
    k[d.op] += 1;
    kindMap.set(d.kind, k);
  }
  const byKind = Array.from(kindMap.entries())
    .map(([kind, counts]) => ({ kind, ...counts }))
    .sort((a, b) => a.kind.localeCompare(b.kind));

  const warnings: string[] = [];
  if (
    before.provider &&
    after.provider &&
    before.provider !== after.provider
  ) {
    warnings.push(
      `Snapshots are from different providers (${before.provider} vs ${after.provider}). The diff still runs but the comparison may not be meaningful.`,
    );
  }

  return {
    totals,
    byKind,
    diffs,
    meta: {
      before: { snapshot_id: before.snapshot_id, captured_at: before.captured_at, provider: before.provider },
      after: { snapshot_id: after.snapshot_id, captured_at: after.captured_at, provider: after.provider },
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function indexResources(resources: InventoryResource[]): Map<string, InventoryResource> {
  const m = new Map<string, InventoryResource>();
  for (const r of resources) {
    const key = `${r.kind}::${r.id}`;
    // Tolerate dupes by keeping the first occurrence — same policy real
    // scanners use when an export double-lists a resource.
    if (!m.has(key)) m.set(key, r);
  }
  return m;
}

function compareFields(a: InventoryResource, b: InventoryResource): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of COMPARED_FIELDS) {
    const before = (a as Record<string, unknown>)[field];
    const after = (b as Record<string, unknown>)[field];
    if (!equalValues(before, after)) {
      // Skip the case where both sides are "unset" (undefined or null) —
      // adding a null where there was undefined isn't a real change.
      if (isUnset(before) && isUnset(after)) continue;
      changes.push({ field, before, after });
    }
  }
  return changes;
}

function equalValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  return false;
}

function isUnset(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickString(parent: unknown, key: string): string | undefined {
  if (!isPlainObject(parent)) return undefined;
  const v = parent[key];
  return typeof v === "string" ? v : undefined;
}

// ---------------------------------------------------------------------------
// Formatting helpers (used by the client + tests)
// ---------------------------------------------------------------------------

export function formatFieldValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : "(empty)";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
