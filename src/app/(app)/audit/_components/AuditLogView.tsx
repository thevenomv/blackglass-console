"use client";

/**
 * Tenant audit log search + paginate UI.
 *
 * Backed by GET /api/v1/saas-audit which exposes substring + actor + time
 * filters and cursor-based pagination over `saas_audit_events`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatAbsoluteUtc, formatRelativeTime } from "@/lib/format-time";

interface AuditEvent {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface AuditPage {
  items: AuditEvent[];
  nextCursor: string | null;
}

const QUICK_ACTIONS = [
  { label: "All", value: "" },
  { label: "Scans", value: "scan" },
  { label: "Findings", value: "drift" },
  { label: "Remediation", value: "remediation" },
  { label: "Members", value: "member" },
  { label: "Billing", value: "checkout" },
  { label: "API keys", value: "apikey" },
  // `auth` substring matches the wave 7/8 SSO + SCIM audit rows
  // (auth.sso_login, auth.scim_provisioned) plus auth.login_*
  // events. SOC reviewers asked for a one-click filter to answer
  // "show me all SSO / SCIM activity in the last 30 days".
  { label: "Auth", value: "auth" },
  { label: "Settings", value: "settings" },
];

export function AuditLogView() {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [since, setSince] = useState(""); // YYYY-MM-DD
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (action) p.set("action", action);
    if (actor) p.set("actor", actor);
    if (since) p.set("since", new Date(since).toISOString());
    return p.toString();
  }, [action, actor, since]);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      try {
        const p = new URLSearchParams(queryString);
        if (cursor) p.set("cursor", cursor);
        const res = await fetch(`/api/v1/saas-audit?${p.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const json = (await res.json()) as AuditPage;
        if (cursor === null) {
          setItems(json.items);
        } else {
          setItems((prev) => [...prev, ...json.items]);
        }
        setNextCursor(json.nextCursor);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [queryString],
  );

  const loadPage = useCallback(
    (cursor: string | null) => {
      setLoading(true);
      void fetchPage(cursor);
    },
    [fetchPage],
  );

  useEffect(() => {
    // setState happens after await inside fetchPage — same pattern used by
    // EvidenceView; the rule fires on the call site regardless.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(null);
  }, [fetchPage]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-card border border-border-default bg-bg-panel p-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            Action contains
          </label>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. scan or remediation"
            className="h-8 w-56 rounded border border-border-default bg-bg-elevated px-2 text-xs text-fg-primary focus:border-accent-blue focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            Actor user id
          </label>
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="user_… or api-key:…"
            className="h-8 w-56 rounded border border-border-default bg-bg-elevated px-2 text-xs font-mono text-fg-primary focus:border-accent-blue focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
            Since (UTC)
          </label>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="h-8 rounded border border-border-default bg-bg-elevated px-2 text-xs text-fg-primary focus:border-accent-blue focus:outline-none"
          />
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => loadPage(null)}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {QUICK_ACTIONS.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setAction(q.value)}
            className={`rounded px-2 py-0.5 font-medium ${
              action === q.value
                ? "bg-accent-blue text-white"
                : "bg-bg-elevated text-fg-muted hover:text-fg-primary"
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="overflow-x-auto rounded-card border border-border-subtle">
        <table className="w-full text-left text-xs">
          <thead className="bg-bg-panel-elevated text-[11px] uppercase tracking-wide text-fg-faint">
            <tr>
              <th className="px-3 py-2 font-semibold">When</th>
              <th className="px-3 py-2 font-semibold">Actor</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Target</th>
              <th className="px-3 py-2 font-semibold"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-fg-faint">
                  No audit events match these filters.
                </td>
              </tr>
            ) : null}
            {items.map((ev) => (
              <tr key={ev.id} className="bg-bg-panel">
                <td
                  className="px-3 py-2 font-mono text-[11px] text-fg-muted"
                  title={formatAbsoluteUtc(ev.createdAt)}
                >
                  {formatRelativeTime(ev.createdAt)}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-fg-muted">
                  {ev.actorUserId ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-fg-primary">{ev.action}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-fg-faint">
                  {ev.targetType ? `${ev.targetType}:${ev.targetId ?? ""}` : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {Object.keys(ev.metadata).length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                      className="text-fg-muted underline-offset-2 hover:text-fg-primary hover:underline"
                    >
                      {expanded === ev.id ? "hide" : "metadata"}
                    </button>
                  ) : null}
                  {expanded === ev.id ? (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-bg-panel-elevated p-2 text-left font-mono text-[10px] text-fg-muted">
                      {JSON.stringify(ev.metadata, null, 2)}
                    </pre>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        {nextCursor ? (
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => loadPage(nextCursor)}
          >
            {loading ? "Loading…" : "Load more"}
          </Button>
        ) : items.length > 0 ? (
          <p className="text-xs text-fg-faint">End of results.</p>
        ) : null}
      </div>
    </div>
  );
}
