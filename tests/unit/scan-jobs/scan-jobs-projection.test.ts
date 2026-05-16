/**
 * Projection logic in src/lib/server/scan-jobs.ts.
 *
 * The projection translates a stored ScanJobRecord into a status the
 * polling client can render. Two important invariants:
 *
 *   1. **Mock / sample-data scans** (no collector configured) must
 *      synthesise "succeeded" after a short elapsed window so the UI
 *      doesn't hang on a perpetual spinner. These records have
 *      `kind` === undefined.
 *
 *   2. **Real scans** (`kind === "real"`) must NEVER report
 *      "succeeded" until the collector explicitly calls
 *      `resolveScan()`. Otherwise the dashboard refreshes BEFORE
 *      drift events are stored — which is what caused the
 *      "Run scan reports 100% baseline alignment despite drift"
 *      bug.
 *
 *   3. While running, real scans should surface the collector's
 *      live `progressDetail` (e.g. "Waiting for fresh agent
 *      snapshot…") so users see what's happening.
 */

import { describe, expect, it } from "vitest";
import {
  enqueueScan,
  markScanReal,
  projectScanJob,
  resolveScan,
  updateScanProgress,
  getScanRecord,
} from "@/lib/server/scan-jobs";

describe("scan-jobs projection", () => {
  it("mock scans synthesise 'succeeded' after the elapsed window", async () => {
    const job = enqueueScan(["mock-host"]);
    // Push createdAt back so the elapsed-time gate fires.
    const rec = getScanRecord(job.id);
    expect(rec).toBeDefined();
    rec!.createdAt = Date.now() - 5_000; // 5s ago

    const view = projectScanJob(rec!);
    expect(view.status).toBe("succeeded");
    expect(view.progress).toBe(100);
  });

  it("real scans do NOT synthesise 'succeeded' before resolveScan() is called", () => {
    const job = enqueueScan(["host-real"]);
    markScanReal(job.id);
    const rec = getScanRecord(job.id);
    expect(rec).toBeDefined();
    // Push createdAt back to a value that WOULD have triggered the
    // mock projection's "succeeded" branch.
    rec!.createdAt = Date.now() - 10_000;

    const view = projectScanJob(rec!);
    // Critical invariant: a real scan in flight stays "running".
    // If this regresses the dashboard will refresh before the drift
    // events land and silently report "100% baseline alignment".
    expect(view.status).toBe("running");
    expect(view.progress).toBeLessThan(100);
  });

  it("real scans surface the collector's progressDetail while running", () => {
    const job = enqueueScan(["host-real-2"]);
    markScanReal(job.id);
    const rec = getScanRecord(job.id);
    rec!.createdAt = Date.now() - 5_000;
    updateScanProgress(job.id, "Waiting for fresh agent snapshot (47s remaining)…");

    const view = projectScanJob(rec!);
    expect(view.status).toBe("running");
    expect(view.detail).toContain("Waiting for fresh agent snapshot");
  });

  it("real scans report the resolved status once resolveScan() is called", () => {
    const job = enqueueScan(["host-real-3"]);
    markScanReal(job.id);
    resolveScan(job.id, "succeeded", "Snapshot merged · 0 drift signals found", 0);

    const rec = getScanRecord(job.id);
    const view = projectScanJob(rec!);
    expect(view.status).toBe("succeeded");
    expect(view.progress).toBe(100);
    expect(view.eventsFound).toBe(0);
  });

  it("real failed scans report 'failed', not synthesised success", () => {
    const job = enqueueScan(["host-real-4"]);
    markScanReal(job.id);
    resolveScan(job.id, "failed", "SSH connection error: ECONNREFUSED");

    const rec = getScanRecord(job.id);
    const view = projectScanJob(rec!);
    expect(view.status).toBe("failed");
    expect(view.detail).toContain("SSH connection error");
  });

  it("updateScanProgress is a no-op once the scan has resolved", () => {
    const job = enqueueScan(["host-real-5"]);
    markScanReal(job.id);
    resolveScan(job.id, "succeeded", "done", 1);

    updateScanProgress(job.id, "should be ignored");
    const rec = getScanRecord(job.id);
    expect(rec?.progressDetail).toBeUndefined();
  });
});
