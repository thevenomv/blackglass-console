"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type ScanPhase = "queued" | "running" | "succeeded" | "failed";

export type ScanJob = {
  id: string;
  label: string;
  phase: ScanPhase;
  progress: number;
  detail: string;
};

type Ctx = {
  jobs: ScanJob[];
  startFleetScan: () => Promise<void>;
  dismiss: (id: string) => void;
};

const ScanJobsContext = createContext<Ctx | null>(null);

const USE_MOCK_SCANS = process.env.NEXT_PUBLIC_USE_MOCK === "true";

export function ScanJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const timers = useRef<Map<string, number>>(new Map());
  const router = useRouter();
  // Track which jobs we've already refreshed for so a slow final poll
  // doesn't fire `router.refresh()` twice for the same scan.
  const refreshed = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) window.clearInterval(t);
    timers.current.delete(id);
    refreshed.current.delete(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const runMockScan = useCallback(
    (id: string) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id ? { ...j, phase: "running", detail: "Enumerating listeners…" } : j,
        ),
      );
      let p = 5;
      const tick = window.setInterval(() => {
        p += 12;
        const phase: ScanPhase = p >= 100 ? "succeeded" : "running";
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id
              ? {
                  ...j,
                  phase,
                  progress: Math.min(100, p),
                  detail:
                    p >= 100
                      ? "Snapshot merged · drift engine idle"
                      : "Collecting SSH, firewall, persistence signals…",
                }
              : j,
          ),
        );
        if (p >= 100) {
          window.clearInterval(tick);
          timers.current.delete(id);
          window.setTimeout(() => dismiss(id), 6000);
        }
      }, 420);
      timers.current.set(id, tick);
    },
    [dismiss],
  );

  const startFleetScan = useCallback(async () => {
    const jobId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `scan-${Date.now()}`;

    const seed: ScanJob = {
      id: jobId,
      label: "Fleet integrity scan",
      phase: "queued",
      progress: 0,
      detail: "Enqueueing collectors…",
    };
    setJobs((prev) => [seed, ...prev]);

    if (USE_MOCK_SCANS) {
      window.setTimeout(() => runMockScan(jobId), 400);
      return;
    }

    try {
      const res = await fetch("/api/v1/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ host_ids: [] }),
      });
      if (!res.ok) {
        let detail = `Could not start scan (HTTP ${res.status})`;
        try {
          const body = (await res.json()) as { error?: string; detail?: string };
          detail = body.detail || body.error || detail;
        } catch {
          /* ignore */
        }
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId ? { ...j, phase: "failed", progress: 100, detail } : j,
          ),
        );
        return;
      }
      const body = (await res.json()) as { id: string };
      const serverId = body.id;

      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, id: serverId, phase: "queued" } : j)),
      );

      const poll = window.setInterval(async () => {
        try {
          const r = await fetch(`/api/v1/scans/${serverId}`);
          if (!r.ok) return;
          const j = (await r.json()) as {
            status: ScanPhase;
            progress: number;
            detail: string;
          };
          setJobs((prev) =>
            prev.map((x) =>
              x.id === serverId
                ? {
                    ...x,
                    phase: j.status,
                    progress: j.progress,
                    detail: j.detail,
                  }
                : x,
            ),
          );
          if (j.status === "succeeded" || j.status === "failed") {
            // Pull fresh server data into whatever route the user is on
            // (dashboard, /drift, /hosts, /baselines, …). The scan worker
            // already calls `revalidatePath` server-side, but that only
            // invalidates the cache — a client that's already mounted on
            // the route still needs `router.refresh()` to re-render with
            // the new drift events. Without this, drift only appears
            // after the user navigates away and back.
            if (!refreshed.current.has(serverId)) {
              refreshed.current.add(serverId);
              router.refresh();
            }
            window.clearInterval(poll);
            timers.current.delete(serverId);
            if (j.status === "succeeded") {
              window.setTimeout(() => dismiss(serverId), 6000);
            }
          }
        } catch {
          /* ignore transient poll errors */
        }
      }, 400);
      timers.current.set(serverId, poll);
    } catch {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                phase: "failed",
                progress: 100,
                detail: "Network error — check connection and try again",
              }
            : j,
        ),
      );
    }
  }, [dismiss, runMockScan, router]);

  const value = useMemo(
    () => ({
      jobs,
      startFleetScan,
      dismiss,
    }),
    [jobs, startFleetScan, dismiss],
  );

  return <ScanJobsContext.Provider value={value}>{children}</ScanJobsContext.Provider>;
}

export function useScanJobs() {
  const ctx = useContext(ScanJobsContext);
  if (!ctx) throw new Error("useScanJobs must be used within ScanJobsProvider");
  return ctx;
}
