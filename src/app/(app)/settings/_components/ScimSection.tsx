"use client";

/**
 * Settings card for SCIM 2.0 provisioning via Clerk Enterprise.
 *
 * Same model as SsoSection — Clerk owns the SCIM endpoint, this card
 * just renders status and gives the operator the URL their IdP
 * needs. We deliberately do NOT echo the bearer token; rotation
 * happens in the Clerk dashboard.
 *
 * Pairs with the `auth.scim_provisioned` SaaS audit row emitted from
 * the Clerk webhook handler when a user.created event arrives via a
 * SCIM-strategy verification, so vendor questionnaires can show
 * "yes, SCIM provisioning emits an audit row".
 */

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";

const BUTTON_PRIMARY =
  "inline-flex h-9 items-center justify-center rounded-card bg-accent-blue px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-blue-hover";
const BUTTON_SECONDARY =
  "inline-flex h-9 items-center justify-center rounded-card border border-border-default bg-transparent px-4 text-sm font-medium text-fg-primary transition-colors duration-150 hover:bg-bg-elevated";

interface ScimStatus {
  enabled: boolean;
  clerkOrgId: string;
  scimBaseUrl: string;
  recommendedRotationDays: number;
  manageUrl: string;
  upgradeUrl: string | null;
}

export function ScimSection() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });

  const [status, setStatus] = useState<ScimStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/settings/scim");
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string; message?: string };
          if (!cancelled) setError(body.detail ?? body.message ?? `HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as ScimStatus;
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const copyUrl = async () => {
    if (!status?.scimBaseUrl) return;
    try {
      await navigator.clipboard.writeText(status.scimBaseUrl);
      toastRef.current("SCIM base URL copied.", "success");
    } catch {
      toastRef.current("Clipboard unavailable.", "warning");
    }
  };

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg-primary">SCIM 2.0 user provisioning</h2>
        <p className="mt-1 text-sm text-fg-muted">
          BLACKGLASS uses Clerk Enterprise for SCIM 2.0 — your IdP
          (Okta, Azure AD, JumpCloud, OneLogin) pushes user and group
          lifecycle events directly to Clerk. Bearer-token rotation
          happens in the Clerk dashboard.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-fg-muted">Loading SCIM status…</p>
      ) : error ? (
        <div className="rounded-card border border-border-subtle bg-bg-elevated p-3 text-sm text-fg-muted">
          <p className="font-medium text-fg-primary">SCIM status unavailable</p>
          <p className="mt-1 text-xs">{error}</p>
        </div>
      ) : !status ? null : status.enabled ? (
        <div className="space-y-3">
          <div className="rounded-card border border-success/30 bg-success-soft/25 p-3 text-sm">
            <p className="font-medium text-success">
              SCIM provisioning is active
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              SCIM-provisioned user creations audit as{" "}
              <code className="font-mono">auth.scim_provisioned</code>{" "}
              in the SaaS audit log so SOC reviewers can distinguish
              IdP-pushed users from in-app invites.
            </p>
          </div>
          <div className="rounded-card border border-border-subtle bg-bg-elevated p-3">
            <p className="text-xs uppercase tracking-wide text-fg-faint">
              SCIM base URL (paste into your IdP)
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="grow truncate rounded bg-bg-base px-2 py-1 font-mono text-[11px] text-fg-primary">
                {status.scimBaseUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyUrl()}
                className="text-xs text-accent-blue hover:underline focus:outline-none"
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-fg-muted">
              Recommended bearer-token rotation: every{" "}
              <span className="font-mono">{status.recommendedRotationDays}</span>{" "}
              days. Rotate in the Clerk dashboard; coordinate the cutover
              with your IdP admin so provisioning never sees a 401 window.
            </p>
          </div>
          <a
            href={status.manageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={BUTTON_SECONDARY}
          >
            Manage in Clerk dashboard
          </a>
        </div>
      ) : (
        <div className="rounded-card border border-border-subtle bg-bg-elevated p-3 text-sm text-fg-muted">
          <p className="font-medium text-fg-primary">SCIM not configured</p>
          <p className="mt-1 text-xs">
            Your organization has no SCIM bearer tokens issued. Provision
            one in the Clerk dashboard&apos;s organization settings,
            then hand the SCIM base URL + bearer token to your IdP
            admin. Most providers (Okta, Azure AD, JumpCloud) ship with
            a SCIM 2.0 connector and ask only for these two values.
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
      )}
    </section>
  );
}
