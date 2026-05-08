"use client";

/**
 * Settings → Notifications → Drift digest opt-out.
 *
 * The cadence (daily / weekly) is a deployment-wide knob
 * (`DRIFT_DIGEST_INTERVAL`). This per-tenant control just lets the
 * customer say "stop emailing me digests" — that was the most common
 * ask and the simplest behaviour to reason about. See
 * `effectiveTenantInterval()` in `drift-digest-service.ts` for the
 * resolution rules.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type DigestState = {
  /** "off" disables digests for this tenant; null inherits deployment default. */
  driftDigestCadence: "off" | null;
  alertEmailTo: string | null;
};

type ApiResponse = {
  settings: {
    alertEmailTo: string | null;
    driftDigestCadence: string | null;
  };
};

export function DriftDigestSection() {
  const [state, setState] = useState<DigestState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/settings/notifications", {
        cache: "no-store",
      });
      if (r.status === 403) {
        setError("Admin role required.");
        return;
      }
      if (!r.ok) {
        setError(`Failed to load: HTTP ${r.status}`);
        return;
      }
      const body = (await r.json()) as ApiResponse;
      const cadence: "off" | null =
        body.settings.driftDigestCadence === "off" ? "off" : null;
      setState({
        driftDigestCadence: cadence,
        alertEmailTo: body.settings.alertEmailTo ?? null,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const update = useCallback(
    async (next: "off" | null) => {
      if (!state) return;
      setSaving(true);
      setError(null);
      try {
        const r = await fetch("/api/v1/settings/notifications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driftDigestCadence: next }),
        });
        if (!r.ok) {
          setError(`Save failed: HTTP ${r.status}`);
          return;
        }
        setState({ ...state, driftDigestCadence: next });
        setSavedAt(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setSaving(false);
      }
    },
    [state],
  );

  if (loading) {
    return <p className="text-xs text-fg-faint">Loading digest settings…</p>;
  }
  if (error) {
    return <p className="text-xs text-danger">{error}</p>;
  }
  if (!state) {
    return null;
  }

  const enabled = state.driftDigestCadence !== "off";
  const hasEmail = (state.alertEmailTo ?? "").length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-fg-primary">
            Scheduled drift digest
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Periodic summary of new findings, top categories, and remediation
            activity. Cadence (daily or weekly) is set deployment-wide; this
            toggle just opts your workspace in or out.
          </p>
        </div>
        <Button
          variant={enabled ? "secondary" : "primary"}
          disabled={saving}
          onClick={() => void update(enabled ? "off" : null)}
        >
          {saving ? "Saving…" : enabled ? "Disable digest" : "Enable digest"}
        </Button>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-fg-faint">Status</dt>
          <dd
            className={`mt-0.5 font-semibold ${
              enabled ? "text-success" : "text-fg-muted"
            }`}
          >
            {enabled ? "Subscribed" : "Disabled for this workspace"}
          </dd>
        </div>
        <div>
          <dt className="text-fg-faint">Recipient</dt>
          <dd className="mt-0.5 text-fg-primary">
            {hasEmail ? state.alertEmailTo : (
              <span className="text-warning">
                No alert email — set one above so the digest has somewhere to
                go.
              </span>
            )}
          </dd>
        </div>
      </dl>

      {savedAt ? (
        <p className="text-[11px] text-fg-faint">
          Saved {savedAt.toLocaleTimeString()}.
        </p>
      ) : null}
    </div>
  );
}
