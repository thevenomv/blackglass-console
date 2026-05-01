/**
 * Baseline store.
 *
 * A baseline is a HostSnapshot captured at a known-good moment.
 *
 * Persistence strategy (in priority order):
 *  1. When BASELINE_STORE_PATH is set, baselines are written to that JSON file
 *     and reloaded from it on first access — surviving process restarts and
 *     DigitalOcean App Platform redeploys (mount a DO Volume at that path).
 *  2. Otherwise falls back to an in-process Map (demo / CI mode).
 */

import type { HostSnapshot } from "./collector";
import * as fs from "fs";
import * as path from "path";

const GLOBAL_KEY = "__blackglass_baselines_v1" as const;

type GlobalWithBaselines = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, HostSnapshot>;
};

// ---------------------------------------------------------------------------
// File persistence helpers
// ---------------------------------------------------------------------------

function storePath(): string | undefined {
  return process.env.BASELINE_STORE_PATH;
}

function loadFromFile(filePath: string): Map<string, HostSnapshot> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const obj = JSON.parse(raw) as Record<string, HostSnapshot>;
    return new Map(Object.entries(obj));
  } catch {
    // File doesn't exist yet or is corrupt — start fresh
    return new Map();
  }
}

function saveToFile(filePath: string, map: Map<string, HostSnapshot>): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(map.entries());
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    // Log but never crash a request because of a write error
    console.error("[baseline-store] Failed to persist baselines:", err);
  }
}

// ---------------------------------------------------------------------------
// In-memory store (process-global so it survives across hot-reloads)
// ---------------------------------------------------------------------------

function store(): Map<string, HostSnapshot> {
  const g = globalThis as GlobalWithBaselines;
  if (!g[GLOBAL_KEY]) {
    const fp = storePath();
    g[GLOBAL_KEY] = fp ? loadFromFile(fp) : new Map();
  }
  return g[GLOBAL_KEY];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function saveBaseline(snapshot: HostSnapshot): void {
  const m = store();
  m.set(snapshot.hostId, snapshot);
  const fp = storePath();
  if (fp) saveToFile(fp, m);
}

export function getBaseline(hostId: string): HostSnapshot | undefined {
  return store().get(hostId);
}

export function listBaselineHostIds(): string[] {
  return [...store().keys()];
}

export function hasBaseline(hostId: string): boolean {
  return store().has(hostId);
}
