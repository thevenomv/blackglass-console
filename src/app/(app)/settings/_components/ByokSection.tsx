"use client";

/**
 * Settings → Identity → "Bring your own key" panel.
 *
 * Phase 3 of the BYOK rollout — full provisioning + verification UI on
 * top of `/api/v1/settings/byok` (GET / POST / DELETE) and
 * `/api/v1/settings/byok/verify`. Operators can:
 *
 *   - configure provider + keyRef, with immediate round-trip verify
 *   - re-verify an existing config (after KMS-side IAM changes)
 *   - disable BYOK (soft — row retained for audit)
 *
 * Never displays / accepts / handles secret material. The keyRef is an
 * opaque public identifier (AWS KMS Key ARN / Vault Transit key name)
 * the operator already knows.
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

type VerifyResult =
  | { ok: true; verifiedAt: string }
  | { ok: false; error: string }
  | null;

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
    return {
      label: "Configured · last verify FAILED",
      className: "text-danger",
    };
  if (s.lastVerifiedAt)
    return { label: "Configured · verified", className: "text-success" };
  return {
    label: "Configured · awaiting verification",
    className: "text-warning",
  };
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
  const [busy, setBusy] = useState(false);
  const [lastVerify, setLastVerify] = useState<VerifyResult>(null);

  const [showForm, setShowForm] = useState(false);
  const [formProvider, setFormProvider] = useState<"awskms" | "vault">("awskms");
  const [formKeyRef, setFormKeyRef] = useState("");

  const loadStatus = useCallback(async () => {
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
  }, [loadStatus]);

  const submitForm = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formKeyRef.trim()) return;
      setBusy(true);
      setError(null);
      setLastVerify(null);
      try {
        const r = await fetch("/api/v1/settings/byok", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: formProvider,
            keyRef: formKeyRef.trim(),
            verify: true,
          }),
        });
        const body = (await r.json()) as {
          ok?: boolean;
          status?: ByokStatus;
          verify?: VerifyResult;
          error?: { message?: string };
        };
        if (!r.ok) {
          setError(body.error?.message ?? `HTTP ${r.status}`);
          return;
        }
        if (body.status) setStatus(body.status);
        if (body.verify) setLastVerify(body.verify);
        setShowForm(false);
        setFormKeyRef("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setBusy(false);
      }
    },
    [formKeyRef, formProvider],
  );

  const reverify = useCallback(async () => {
    setBusy(true);
    setError(null);
    setLastVerify(null);
    try {
      const r = await fetch("/api/v1/settings/byok/verify", { method: "POST" });
      const body = (await r.json()) as {
        verify?: VerifyResult;
        status?: ByokStatus;
        error?: { message?: string };
      };
      if (!r.ok) {
        setError(body.error?.message ?? `HTTP ${r.status}`);
        return;
      }
      if (body.status) setStatus(body.status);
      if (body.verify) setLastVerify(body.verify);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, []);

  const disableByok = useCallback(async () => {
    if (
      !window.confirm(
        "Disable BYOK for this workspace?\n\n" +
          "Existing credentials wrapped by your KMS key will FAIL to decrypt " +
          "until you re-enable BYOK or re-encrypt them.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setLastVerify(null);
    try {
      const r = await fetch("/api/v1/settings/byok", { method: "DELETE" });
      const body = (await r.json()) as { status?: ByokStatus };
      if (!r.ok) {
        setError(`Disable failed: HTTP ${r.status}`);
        return;
      }
      if (body.status) setStatus(body.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, []);

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
            keys and other tenant secrets never touch the platform root
            key. Per-tenant KMS wiring is documented in your deployment operator
            materials; request details from your Blackglass contact if needed.
          </p>
        </div>
        <Button variant="secondary" disabled={loading || busy} onClick={() => void loadStatus()}>
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
          <dd
            className="mt-0.5 text-xs text-fg-muted"
            title={status?.lastVerifiedAt ?? undefined}
          >
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

      {lastVerify ? (
        lastVerify.ok ? (
          <p className="rounded border border-success/40 bg-success-soft-bg p-2 text-xs text-success">
            Round-trip verified at{" "}
            <span className="font-mono">{new Date(lastVerify.verifiedAt).toLocaleString()}</span>
            .
          </p>
        ) : (
          <p className="rounded border border-danger/40 bg-danger-soft-bg p-2 text-xs text-danger">
            Verification failed: <span className="font-mono">{lastVerify.error}</span>
          </p>
        )
      ) : null}

      {!status?.byokEnabled ? (
        <div className="rounded border border-border-subtle bg-bg-panel-elevated p-3 text-xs text-fg-muted">
          BYOK is enabled per-deployment via the{" "}
          <code className="font-mono">BYOK_ENABLED</code> env var. Hosted
          customers on the Enterprise plan can request it by
          emailing{" "}
          <a
            href="mailto:enterprise@blackglasssec.com?subject=BYOK%20enablement%20request"
            className="text-accent-blue"
          >
            enterprise@blackglasssec.com
          </a>
          . Self-hosted deployments can flip the flag and use the form
          below once it appears.
        </div>
      ) : status.configured ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void reverify()}>
            {busy ? "Verifying…" : "Verify now"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setShowForm((s) => !s);
              setFormProvider(status.provider ?? "awskms");
              setFormKeyRef(status.keyRef ?? "");
            }}
          >
            {showForm ? "Cancel" : "Update key"}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void disableByok()}>
            Disable BYOK
          </Button>
        </div>
      ) : (
        <div className="flex">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              setShowForm(true);
              setFormProvider("awskms");
              setFormKeyRef("");
            }}
          >
            Configure BYOK
          </Button>
        </div>
      )}

      {showForm ? (
        <form
          onSubmit={(e) => void submitForm(e)}
          className="space-y-3 rounded border border-border-subtle bg-bg-panel-elevated p-3"
        >
          <div>
            <label
              htmlFor="byok-provider"
              className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint"
            >
              Provider
            </label>
            <select
              id="byok-provider"
              value={formProvider}
              onChange={(e) =>
                setFormProvider(e.target.value as "awskms" | "vault")
              }
              className="mt-1 block w-full rounded border border-border-default bg-bg-input px-2 py-1 text-sm text-fg-primary"
              disabled={busy}
            >
              <option value="awskms">AWS KMS</option>
              <option value="vault">HashiCorp Vault Transit</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="byok-keyref"
              className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint"
            >
              Key reference
            </label>
            <input
              id="byok-keyref"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={formKeyRef}
              onChange={(e) => setFormKeyRef(e.target.value)}
              placeholder={
                formProvider === "awskms"
                  ? "arn:aws:kms:us-east-1:123456789012:key/abcd1234-…"
                  : "blackglass-tenant-acme"
              }
              className="mt-1 block w-full rounded border border-border-default bg-bg-input px-2 py-1 font-mono text-xs text-fg-primary"
              disabled={busy}
              required
            />
            <p className="mt-1 text-[11px] text-fg-faint">
              {formProvider === "awskms"
                ? "Full KMS Key ARN. The deployment IAM role must have kms:Encrypt + kms:Decrypt on this key."
                : "Vault Transit key name (just the name, e.g. blackglass-tenant-acme). The deployment Vault token must have encrypt + decrypt capabilities."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || !formKeyRef.trim()}>
              {busy ? "Saving + verifying…" : "Save and verify"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setShowForm(false);
                setFormKeyRef("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
