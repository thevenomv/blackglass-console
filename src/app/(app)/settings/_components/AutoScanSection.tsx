"use client";

/**
 * AutoScanSection — settings card for configuring automatic scheduled scans.
 *
 * Reads the current schedule from GET /api/v1/scans/schedule.
 * Saves changes via PUT /api/v1/scans/schedule.
 *
 * Plan gate: scheduledScans must be enabled (enforced by the API too).
 */

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useEffect, useState } from "react";

interface Schedule {
  enabled: boolean;
  intervalHours: number;
}

const INTERVAL_OPTIONS = [
  { label: "Every hour", value: 1 },
  { label: "Every 2 hours", value: 2 },
  { label: "Every 4 hours", value: 4 },
  { label: "Every 8 hours", value: 8 },
  { label: "Every 24 hours", value: 24 },
  { label: "Every 48 hours", value: 48 },
];

export function AutoScanSection() {
  const { toast } = useToast();
  const [schedule, setSchedule] = useState<Schedule>({ enabled: false, intervalHours: 4 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/scans/schedule")
      .then((r) => r.json())
      .then((d: { schedule?: Schedule }) => {
        if (d.schedule) setSchedule(d.schedule);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/scans/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast(
        schedule.enabled
          ? `Auto-scan enabled — runs every ${schedule.intervalHours}h.`
          : "Auto-scan disabled.",
        "success",
      );
    } catch {
      toast("Failed to save schedule — check Redis / plan limits.", "danger");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-10 animate-pulse rounded-card bg-bg-elevated" />;
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={schedule.enabled}
          onChange={(e) => setSchedule((s) => ({ ...s, enabled: e.target.checked }))}
          className="h-4 w-4 rounded border-border-default accent-accent-blue"
        />
        <span className="text-sm text-fg-primary">Enable automatic fleet scans</span>
      </label>

      {schedule.enabled && (
        <div className="flex items-center gap-2">
          <label htmlFor="scan-interval" className="text-sm text-fg-muted">
            Run
          </label>
          <select
            id="scan-interval"
            value={schedule.intervalHours}
            onChange={(e) =>
              setSchedule((s) => ({ ...s, intervalHours: Number(e.target.value) }))
            }
            className="rounded-card border border-border-default bg-bg-base px-2 py-1.5 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button
        variant="secondary"
        type="button"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save schedule"}
      </Button>
    </div>
  );
}
