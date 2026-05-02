import type { HostSnapshot } from "@/lib/server/collector/types";

export type StoreAdapter = "memory" | "filesystem" | "spaces";

// ---------------------------------------------------------------------------
// Typed store errors — surface in health() and /api/health
// ---------------------------------------------------------------------------

export type StoreErrorKind =
  | "not_configured"   // required env vars missing
  | "unavailable"      // network / SDK error reaching the backend
  | "not_found"        // key doesn't exist (expected in some read paths)
  | "corrupt_record";  // JSON parse failure on stored data

export class StoreError extends Error {
  constructor(
    public readonly kind: StoreErrorKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export interface BaselineStoreHealth {
  adapter: StoreAdapter;
  configured: boolean;
  path?: string;
  writable: boolean | null;
}

export interface BaselineRepository {
  save(snapshot: HostSnapshot): Promise<void>;
  get(hostId: string): Promise<HostSnapshot | undefined>;
  listHostIds(): Promise<string[]>;
  has(hostId: string): Promise<boolean>;
  health(): BaselineStoreHealth;
}

export type DayEntry = { ymd: string; totalNewFindings: number };

export interface DriftHistoryRepository {
  readonly adapter: StoreAdapter;
  recordDay(count: number): Promise<void>;
  getDays(): Promise<DayEntry[]>;
}
