"use client";

/**
 * Per-tenant retention policy editor.
 *
 * Backed by GET / PUT /api/v1/settings/retention.  Empty / 0 in any field
 * disables pruning for that data class — the historic deployment behaviour.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Policy {
  driftEventsDays: number | null;
  baselineSnapshotsDays: number | null;
  auditEventsDays: number | null;
  evidenceBundlesDays: number | null;
}

const FIELDS: Array<{
  key: keyof Policy;
  label: string;
  hint: string;
}> = [
  {
    key: "driftEventsDays",
    label: "Findings",
    hint: "Detected findings; the most useful long-tail audit data.",
  },
  {
    key: "baselineSnapshotsDays",
    label: "Baseline snapshots",
    hint: "Older snapshots beyond the most recent per host.",
  },
  {
    key: "auditEventsDays",
    label: "Audit events",
    hint: "Tenant-scoped saas_audit_events rows.",
  },
  {
    key: "evidenceBundlesDays",
    label: "Evidence bundles",
    hint: "Generated PDFs / JSON archives.",
  },
];

export function RetentionSection() {
  const [policy, setPolicy] = useState<Policy>({
    driftEventsDays: null,
    baselineSnapshotsDays: null,
    auditEventsDays: null,
    evidenceBundlesDays: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/settings/retention", { cache: "no-store" });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const json = (await res.json()) as Policy;
        if (!cancelled) setPolicy(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function setField(key: keyof Policy, raw: string) {
    if (raw === "") {
      setPolicy((p) => ({ ...p, [key]: null }));
      return;
    }
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 36500) {
      setPolicy((p) => ({ ...p, [key]: n }));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/settings/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(j?.message ?? `Server returned ${res.status}`);
      }
      const next = (await res.json()) as Policy;
      setPolicy(next);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-xs text-fg-faint">Loading retention policy…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
              {f.label}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={36500}
                placeholder="Keep forever"
                value={policy[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="h-8 w-24 rounded border border-border-default bg-bg-elevated px-2 text-xs text-fg-primary focus:border-accent-blue focus:outline-none"
              />
              <span className="text-xs text-fg-muted">days</span>
            </div>
            <span className="text-[11px] text-fg-faint">{f.hint}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save retention policy"}
        </Button>
        {savedAt ? (
          <span className="text-[11px] text-fg-faint">
            Saved {new Date(savedAt).toLocaleTimeString("en-GB")}.
          </span>
        ) : null}
        {error ? <span className="text-[11px] text-danger">{error}</span> : null}
      </div>
      <p className="text-[11px] text-fg-faint">
        Pruning runs nightly via the platform retention worker. Leave a field
        blank or zero to keep that data class forever (the historic default).
      </p>
    </div>
  );
}
