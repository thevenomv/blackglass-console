/**
 * Drift detection engine — public API surface.
 *
 * The implementation is split into:
 *   - `compute.ts`       — pure `computeDrift(baseline, current)`
 *   - `store.ts`         — in-memory + JSON-file persistence (synchronous)
 *   - `store-async.ts`   — Postgres-backed reads (cross-process freshness)
 *   - `helpers.ts`       — `id()` / `now()` leaf utilities
 *
 * Re-export only — never put logic in this file. See REFACTOR.md for the
 * remaining per-category compute carve-up (`compute/` subdir).
 */

export { computeDrift } from "./compute";

export {
  storeDriftEvents,
  getDriftEvents,
  hasDriftData,
} from "./store";

export {
  deleteDriftEvents,
  getDriftEventsAsync,
  hasDriftDataAsync,
} from "./store-async";
