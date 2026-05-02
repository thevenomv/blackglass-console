import type { HostSnapshot } from "@/lib/server/collector/types";

export type StoreAdapter = "memory" | "filesystem" | "spaces";

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
  recordDay(count: number): Promise<void>;
  getDays(): Promise<DayEntry[]>;
}
