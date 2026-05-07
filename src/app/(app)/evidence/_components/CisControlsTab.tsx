"use client";

/**
 * CIS evidence-of-control mapping editor.
 *
 * Lists this tenant's CIS Control → drift category bindings, lets admins
 * add / edit / delete entries.  Auditors get read-only access (the API
 * gates writes via settings.write).
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface Mapping {
  id: string;
  controlId: string;
  controlTitle: string;
  driftCategory: string;
  status: "active" | "not_applicable" | "draft";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const DRIFT_CATEGORIES = [
  "ssh", "network_exposure", "firewall", "packages",
  "integrity", "identity", "privilege_escalation", "persistence",
] as const;

const STATUS_TONE: Record<Mapping["status"], "success" | "neutral" | "warning"> = {
  active: "success",
  not_applicable: "warning",
  draft: "neutral",
};

interface DraftRow {
  controlId: string;
  controlTitle: string;
  driftCategory: (typeof DRIFT_CATEGORIES)[number];
  status: Mapping["status"];
  notes: string;
}

const EMPTY_DRAFT: DraftRow = {
  controlId: "",
  controlTitle: "",
  driftCategory: "ssh",
  status: "active",
  notes: "",
};

export function CisControlsTab({ canEdit }: { canEdit: boolean }) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRow>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/evidence/cis-mappings", { cache: "no-store" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = (await res.json()) as { mappings: Mapping[] };
      setMappings(json.mappings ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // setState happens after await inside fetchOnce — same pattern used
    // elsewhere; rule fires on the call site regardless.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOnce();
  }, [fetchOnce]);

  async function save() {
    if (!draft.controlId.trim() || !draft.controlTitle.trim()) {
      setError("Control id and title are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/evidence/cis-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlId: draft.controlId.trim(),
          controlTitle: draft.controlTitle.trim(),
          driftCategory: draft.driftCategory,
          status: draft.status,
          notes: draft.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(j?.message ?? `Server returned ${res.status}`);
      }
      setDraft(EMPTY_DRAFT);
      await fetchOnce();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/evidence/cis-mappings/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Server returned ${res.status}`);
      }
      await fetchOnce();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <p className="text-xs text-fg-faint">Loading control mappings…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-card border border-border-subtle">
        <table className="w-full text-left text-xs">
          <thead className="bg-bg-panel-elevated text-[11px] uppercase tracking-wide text-fg-faint">
            <tr>
              <th className="px-3 py-2 font-semibold">Control</th>
              <th className="px-3 py-2 font-semibold">Title</th>
              <th className="px-3 py-2 font-semibold">Drift category</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Notes</th>
              {canEdit ? <th className="px-3 py-2 text-right" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-3 py-6 text-center text-fg-faint">
                  No CIS control mappings yet.{" "}
                  {canEdit
                    ? "Use the form below to map your first control."
                    : "Ask a workspace admin to create the first one."}
                </td>
              </tr>
            ) : null}
            {mappings.map((m) => (
              <tr key={m.id} className="bg-bg-panel">
                <td className="px-3 py-2 font-mono text-[11px] text-fg-primary">{m.controlId}</td>
                <td className="px-3 py-2 text-fg-muted">{m.controlTitle}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-fg-muted">{m.driftCategory}</td>
                <td className="px-3 py-2">
                  <Badge tone={STATUS_TONE[m.status]}>{m.status.replace("_", " ")}</Badge>
                </td>
                <td className="px-3 py-2 text-[11px] text-fg-faint">{m.notes ?? "—"}</td>
                {canEdit ? (
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="secondary"
                      disabled={deletingId === m.id}
                      onClick={() => void remove(m.id)}
                    >
                      {deletingId === m.id ? "Removing…" : "Remove"}
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="rounded-card border border-border-default bg-bg-panel p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
            Add or update mapping
          </h3>
          <p className="mt-1 text-[11px] text-fg-faint">
            Posting an existing (Control id + Drift category) updates that
            row in place.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">Control id</span>
              <input
                value={draft.controlId}
                onChange={(e) => setDraft((d) => ({ ...d, controlId: e.target.value }))}
                placeholder="CIS-4.1"
                className="h-8 rounded border border-border-default bg-bg-elevated px-2 text-xs font-mono text-fg-primary focus:border-accent-blue focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">Title</span>
              <input
                value={draft.controlTitle}
                onChange={(e) => setDraft((d) => ({ ...d, controlTitle: e.target.value }))}
                placeholder="Configure secure SSH"
                className="h-8 rounded border border-border-default bg-bg-elevated px-2 text-xs text-fg-primary focus:border-accent-blue focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">Drift category</span>
              <select
                value={draft.driftCategory}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    driftCategory: e.target.value as DraftRow["driftCategory"],
                  }))
                }
                className="h-8 rounded border border-border-default bg-bg-elevated px-2 text-xs font-mono text-fg-primary focus:border-accent-blue focus:outline-none"
              >
                {DRIFT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">Status</span>
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, status: e.target.value as Mapping["status"] }))
                }
                className="h-8 rounded border border-border-default bg-bg-elevated px-2 text-xs text-fg-primary focus:border-accent-blue focus:outline-none"
              >
                <option value="active">active</option>
                <option value="draft">draft</option>
                <option value="not_applicable">not applicable</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">Notes (optional)</span>
              <input
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder="Required when status is 'not applicable'."
                className="h-8 rounded border border-border-default bg-bg-elevated px-2 text-xs text-fg-primary focus:border-accent-blue focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3">
            <Button variant="primary" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save mapping"}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
