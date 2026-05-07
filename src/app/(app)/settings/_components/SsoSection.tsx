"use client";

/**
 * Settings card for SAML SSO via Clerk Enterprise.
 *
 * BLACKGLASS doesn't run its own SAML implementation — Clerk owns the
 * IdP metadata, signing certs, and assertion verification. This card
 * just renders a read-only view of the org's SAML connections (fetched
 * from the Clerk Backend API server-side) plus a deep-link to the
 * Clerk dashboard where the operator manages them.
 *
 * SOC 2 / vendor-security questionnaires almost always ask "do you
 * support SSO?" — this card lets you say yes by showing it actively
 * working in your own tenant.
 */

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";

const BUTTON_PRIMARY =
  "inline-flex h-9 items-center justify-center rounded-card bg-accent-blue px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-blue-hover";
const BUTTON_SECONDARY =
  "inline-flex h-9 items-center justify-center rounded-card border border-border-default bg-transparent px-4 text-sm font-medium text-fg-primary transition-colors duration-150 hover:bg-bg-elevated";

interface SsoConnection {
  id: string;
  name: string;
  provider: string;
  domain: string | null;
  active: boolean;
  syncUserAttributes: boolean;
  acsUrl: string | null;
  spEntityId: string | null;
}

interface SsoStatus {
  enabled: boolean;
  clerkOrgId: string;
  connections: SsoConnection[];
  manageUrl: string;
  upgradeUrl: string | null;
}

export function SsoSection() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });

  const [status, setStatus] = useState<SsoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/settings/sso");
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string; message?: string };
          if (!cancelled) setError(body.detail ?? body.message ?? `HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as SsoStatus;
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const copyAcs = (url: string) => async () => {
    try {
      await navigator.clipboard.writeText(url);
      toastRef.current("ACS URL copied.", "success");
    } catch {
      toastRef.current("Clipboard unavailable.", "warning");
    }
  };

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg-primary">Single sign-on (SAML)</h2>
        <p className="mt-1 text-sm text-fg-muted">
          BLACKGLASS uses Clerk Enterprise for SAML SSO. IdP metadata,
          signing certificates, and attribute mappings live in the Clerk
          dashboard; this view is read-only.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-fg-muted">Loading SSO status…</p>
      ) : error ? (
        <div className="rounded-card border border-border-subtle bg-bg-elevated p-3 text-sm text-fg-muted">
          <p className="font-medium text-fg-primary">SSO status unavailable</p>
          <p className="mt-1 text-xs">{error}</p>
        </div>
      ) : !status ? null : status.connections.length === 0 ? (
        <div className="rounded-card border border-border-subtle bg-bg-elevated p-3 text-sm text-fg-muted">
          <p className="font-medium text-fg-primary">SSO not configured</p>
          <p className="mt-1 text-xs">
            Your organization has no SAML connections. Add one in the Clerk
            dashboard&apos;s organization settings — Clerk will issue the
            ACS URL and SP entity ID you hand to your IdP (Okta, Azure AD,
            JumpCloud, etc.).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={status.manageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={BUTTON_PRIMARY}
            >
              Open Clerk dashboard
            </a>
            {status.upgradeUrl ? (
              <a
                href={status.upgradeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={BUTTON_SECONDARY}
              >
                Upgrade Clerk plan
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-card border border-success/30 bg-success-soft/25 p-3 text-sm">
            <p className="font-medium text-success">
              SSO is active &middot; {status.connections.filter((c) => c.active).length} of{" "}
              {status.connections.length} connection
              {status.connections.length === 1 ? "" : "s"} live
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              SAML logins are audited as <code className="font-mono">auth.sso_login</code>{" "}
              in the audit log so SOC reviewers can filter on them
              separately from password / OAuth sessions.
            </p>
          </div>
          <ul className="space-y-2">
            {status.connections.map((c) => (
              <li
                key={c.id}
                className="rounded-card border border-border-subtle bg-bg-elevated p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-fg-primary">{c.name}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      <span className="font-mono">{c.provider}</span>
                      {c.domain ? <> &middot; <span className="font-mono">{c.domain}</span></> : null}
                    </p>
                  </div>
                  <span
                    className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      c.active
                        ? "bg-success-soft text-success"
                        : "bg-warning-soft text-warning"
                    }`}
                  >
                    {c.active ? "Active" : "Inactive"}
                  </span>
                </div>
                {c.acsUrl ? (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="grow truncate rounded bg-bg-base px-2 py-1 font-mono text-[11px] text-fg-primary">
                      {c.acsUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyAcs(c.acsUrl ?? "")()}
                      className="text-xs text-accent-blue hover:underline focus:outline-none"
                    >
                      Copy ACS URL
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <a
            href={status.manageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={BUTTON_SECONDARY}
          >
            Manage in Clerk dashboard
          </a>
        </div>
      )}
    </section>
  );
}
