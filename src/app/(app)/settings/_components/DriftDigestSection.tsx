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

type SendResult =
  | { kind: "ok"; to: string; emailSent: boolean; skippedReason: string | null; totals: { high: number; new: number; affectedHosts: number } }
  | { kind: "error"; message: string };

export function DriftDigestSection() {
  const [state, setState] = useState<DigestState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

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

  const sendNow = useCallback(async () => {
    setSending(true);
    setSendResult(null);
    try {
      const r = await fetch("/api/v1/settings/drift-digest/send", { method: "POST" });
      const body = (await r.json().catch(() => ({}))) as {
        result?: {
          to?: string;
          emailSent?: boolean;
          skippedReason?: string | null;
          totals?: { high?: number; new?: number; affectedHosts?: number };
        };
        error?: string;
        detail?: string;
      };
      if (!r.ok || !body.result) {
        setSendResult({
          kind: "error",
          message: body.detail ?? body.error ?? `Send failed: HTTP ${r.status}`,
        });
        return;
      }
      setSendResult({
        kind: "ok",
        to: body.result.to ?? "",
        emailSent: Boolean(body.result.emailSent),
        skippedReason: body.result.skippedReason ?? null,
        totals: {
          high: body.result.totals?.high ?? 0,
          new: body.result.totals?.new ?? 0,
          affectedHosts: body.result.totals?.affectedHosts ?? 0,
        },
      });
    } catch (err) {
      setSendResult({
        kind: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSending(false);
    }
  }, []);

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

      <div className="mt-3 border-t border-border-subtle pt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-fg-primary">Send a test digest now</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Builds the digest using the current deployment cadence (daily or weekly window) and
              sends it to the alert email above. Useful for previewing before the next scheduled
              run or after changing the recipient.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={sending || !hasEmail}
            onClick={() => void sendNow()}
            title={!hasEmail ? "Set an alert email above first" : undefined}
          >
            {sending ? "Sending…" : "Send test digest"}
          </Button>
        </div>
        {sendResult ? (
          sendResult.kind === "error" ? (
            <p className="mt-2 text-xs text-danger">{sendResult.message}</p>
          ) : (
            <div className="mt-2 rounded-md border border-border-subtle bg-bg-elevated p-2 text-xs">
              {sendResult.emailSent ? (
                <p className="text-success">
                  Sent to {sendResult.to} — {sendResult.totals.high} high · {sendResult.totals.new} new ·{" "}
                  {sendResult.totals.affectedHosts} hosts in window.
                </p>
              ) : (
                <p className="text-fg-muted">
                  No email dispatched ({sendResult.skippedReason ?? "skipped"}). Recipient: {sendResult.to || "—"}.
                </p>
              )}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
