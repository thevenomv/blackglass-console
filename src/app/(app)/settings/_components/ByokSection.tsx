"use client";

/**
 * Settings → Identity → "Bring your own key" panel.
 *
 * Surfaces the redacted BYOK status from `/api/v1/settings/byok`. Phase 3
 * of the BYOK rollout — Phase 1 shipped the data model, Phase 2 will
 * wire `encryptKey()` / `decryptKey()` through the per-tenant lookup.
 *
 * The form for actually configuring the customer KMS key lives behind a
 * "Request access" CTA today: BYOK provisioning involves a customer
 * support touch (we need their KMS Key ARN, an IAM role to assume,
 * etc.) so we drive them to email rather than guess at form fields
 * that won't validate without backend integration. When Phase 2 lands
 * this becomes a real form.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type ByokStatus = {
  byokEnabled: boolean;
  configured: boolean;
  provider: "awskms" | "vault" | null;
  keyRef: string | null;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
};

function statusBadge(s: ByokStatus | null): {
  label: string;
  className: string;
} {
  if (!s) return { label: "Loading…", className: "text-fg-faint" };
  if (!s.byokEnabled)
    return {
      label: "Not enabled on this deployment",
      className: "text-fg-faint",
    };
  if (!s.configured)
    return { label: "Not configured", className: "text-fg-muted" };
  if (s.lastVerifyError)
    return { label: "Configured · last verify FAILED", className: "text-danger" };
  return { label: "Configured · verified", className: "text-success" };
}

function formatProvider(p: ByokStatus["provider"]): string {
  if (p === "awskms") return "AWS KMS";
  if (p === "vault") return "HashiCorp Vault Transit";
  return "—";
}

export function ByokSection() {
  const [status, setStatus] = useState<ByokStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/settings/byok", { cache: "no-store" });
      if (r.status === 403) {
        setError("Owner / admin role required to view BYOK status.");
        return;
      }
      if (!r.ok) {
        setError(`Failed to load BYOK status: HTTP ${r.status}`);
        return;
      }
      setStatus((await r.json()) as ByokStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetchOnce();
  }, [fetchOnce]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchOnce();
  }, [fetchOnce]);

  const badge = statusBadge(status);

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg-primary">
            Bring your own key (BYOK)
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Use your own KMS key (AWS KMS or HashiCorp Vault Transit) to
            wrap data-encryption keys for this workspace. Plaintext SSH
            keys and other tenant secrets never touch the BLACKGLASS root
            key. See the{" "}
            <a
              href="https://github.com/thevenomv/blackglass-console/blob/main/src/lib/server/secrets/README.md#per-tenant-kms--byok-phase-1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-blue"
            >
              architecture doc
            </a>
            .
          </p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={refresh}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-fg-faint">Status</dt>
          <dd className={`mt-0.5 font-semibold ${badge.className}`}>
            {badge.label}
          </dd>
        </div>
        <div>
          <dt className="text-fg-faint">Provider</dt>
          <dd className="mt-0.5 text-fg-primary">
            {formatProvider(status?.provider ?? null)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-fg-faint">Key reference</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-fg-primary">
            {status?.keyRef ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-fg-faint">Last verified</dt>
          <dd className="mt-0.5 text-xs text-fg-muted" title={status?.lastVerifiedAt ?? undefined}>
            {status?.lastVerifiedAt
              ? new Date(status.lastVerifiedAt).toLocaleString()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-fg-faint">Last verify error</dt>
          <dd
            className={`mt-0.5 text-xs ${
              status?.lastVerifyError ? "text-danger" : "text-fg-muted"
            }`}
          >
            {status?.lastVerifyError ?? "—"}
          </dd>
        </div>
      </dl>

      {!status?.byokEnabled ? (
        <div className="rounded border border-border-subtle bg-bg-panel-elevated p-3 text-xs text-fg-muted">
          BYOK is enabled per-deployment via the{" "}
          <code className="font-mono">BYOK_ENABLED</code> env var. Hosted
          customers on the BLACKGLASS Enterprise tier can request it by
          emailing{" "}
          <a
            href="mailto:enterprise@blackglasssec.com?subject=BYOK%20enablement%20request"
            className="text-accent-blue"
          >
            enterprise@blackglasssec.com
          </a>{" "}
          with their AWS KMS Key ARN or Vault Transit key name. Self-hosted
          deployments can flip the flag and POST to the (forthcoming)
          provisioning endpoint described in the architecture doc.
        </div>
      ) : !status.configured ? (
        <div className="rounded border border-border-subtle bg-bg-panel-elevated p-3 text-xs text-fg-muted">
          BYOK is enabled on this deployment but no per-tenant key is
          configured yet — the global KMS provider is being used. Email{" "}
          <a
            href="mailto:enterprise@blackglasssec.com?subject=BYOK%20configuration%20request"
            className="text-accent-blue"
          >
            enterprise@blackglasssec.com
          </a>{" "}
          to provision your KMS key, or wire the configuration via the
          forthcoming Settings → Identity → BYOK form (Phase 3 of the
          BYOK rollout).
        </div>
      ) : null}
    </section>
  );
}
