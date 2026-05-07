"use client";

/**
 * Settings card for the per-tenant webhook signing key.
 *
 * Lifecycle:
 *  1. On mount, fetch GET /api/v1/settings/webhooks/signing-key — returns
 *     the current fingerprint (never the raw key) plus the previous-key
 *     status (active during the rotation overlap window).
 *  2. On rotate, POST → returns the *new* raw key once. We surface it in a
 *     reveal panel that the operator must click "I've copied this" on
 *     before it's removed from component state. There is no other way to
 *     retrieve the key again — receivers must verify by fingerprint.
 *
 * Security boundary:
 *  - Raw key never leaves component state; it is not persisted to
 *    localStorage / cookies / Sentry tags.
 *  - The fetch path is gated by `settings.write` server-side; the UI also
 *    skips rendering when the user lacks the permission.
 */

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCallback, useEffect, useRef, useState } from "react";

interface SigningKeyStatus {
  hasKey: boolean;
  fingerprint: string | null;
  previousFingerprint: string | null;
  rotatedAt: string | null;
  previousActive: boolean;
  overlapHours: number;
}

function formatRotated(iso: string | null): string {
  if (!iso) return "never";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "unknown";
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(d) + " UTC";
  } catch {
    return iso;
  }
}

export function WebhookSigningKeySection() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });

  const [status, setStatus] = useState<SigningKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  /** New key revealed once after rotation; cleared when the operator confirms copy. */
  const [newKey, setNewKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/settings/webhooks/signing-key");
        if (!res.ok) {
          // 400 not_supported in legacy mode — render the env-var status without a rotate button.
          const body = (await res.json().catch(() => ({}))) as { status?: SigningKeyStatus };
          if (!cancelled && body.status) setStatus(body.status);
          return;
        }
        const data = (await res.json()) as { status: SigningKeyStatus };
        if (!cancelled) setStatus(data.status);
      } catch {
        if (!cancelled) toastRef.current("Could not load signing key status.", "danger");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const performRotate = useCallback(async () => {
    setRotating(true);
    setConfirmRotate(false);
    try {
      const res = await fetch("/api/v1/settings/webhooks/signing-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as {
        newKey?: string;
        fingerprint?: string;
        rotatedAt?: string;
        overlapHours?: number;
        message?: string;
        detail?: string;
      };
      if (!res.ok || !body.newKey) {
        toastRef.current(body.detail ?? body.message ?? "Rotation failed.", "danger");
        return;
      }
      setNewKey(body.newKey);
      // Refresh status so the previous-key indicator updates.
      const refreshed = await fetch("/api/v1/settings/webhooks/signing-key");
      if (refreshed.ok) {
        const refreshedBody = (await refreshed.json()) as { status: SigningKeyStatus };
        setStatus(refreshedBody.status);
      }
      toastRef.current(
        `Signing key rotated. Previous key remains valid for ${body.overlapHours ?? 24} hour${body.overlapHours === 1 ? "" : "s"}.`,
        "success",
      );
    } catch {
      toastRef.current("Rotation failed — network error.", "danger");
    } finally {
      setRotating(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      toastRef.current("Key copied to clipboard.", "success");
    } catch {
      toastRef.current("Clipboard not available; select + copy manually.", "warning");
    }
  }, [newKey]);

  const handleAcknowledge = useCallback(() => {
    setNewKey(null);
  }, []);

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg-primary">Webhook signing key</h2>
          <p className="mt-1 text-sm text-fg-muted">
            HMAC-SHA256 key used to sign every outbound webhook payload (the{" "}
            <code className="font-mono text-xs">X-Blackglass-Signature</code>{" "}
            header). Per-tenant; rotation keeps the previous key valid for{" "}
            <span className="font-mono">{status?.overlapHours ?? 24}h</span>{" "}
            so receivers can roll over without a hard cutover.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : !status ? (
        <p className="text-sm text-fg-muted">Status unavailable.</p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-card border border-border-subtle bg-bg-elevated p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-fg-faint">
                  Current key
                </p>
                <p className="mt-0.5 font-mono text-sm text-fg-primary">
                  {status.fingerprint ? (
                    <>
                      <span className="text-fg-faint">sha256:</span>
                      {status.fingerprint}…
                    </>
                  ) : (
                    <span className="text-fg-faint">— no key set —</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  Last rotated: {formatRotated(status.rotatedAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={rotating}
                onClick={() => setConfirmRotate(true)}
              >
                {rotating ? "Rotating…" : status.hasKey ? "Rotate key" : "Generate key"}
              </Button>
            </div>
          </div>

          {status.previousActive && status.previousFingerprint ? (
            <div className="rounded-card border border-warning/30 bg-warning-soft/25 p-3 text-xs text-fg-muted">
              <p className="font-medium text-warning">Previous key still active</p>
              <p className="mt-1">
                <span className="font-mono">sha256:{status.previousFingerprint}…</span>{" "}
                — receivers can verify against this key for up to{" "}
                {status.overlapHours}h after the rotation. After that the
                <code className="ml-1 font-mono">X-Blackglass-Signature-Previous</code>{" "}
                header stops being emitted.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Reveal panel — shown ONCE after rotation. The raw key never leaves
          component state. */}
      {newKey ? (
        <div className="rounded-card border border-accent-blue/40 bg-accent-blue-soft/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-blue">
            New signing key — copy this now
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            This is the only time the raw key is shown. Distribute it to your
            webhook receivers, then click acknowledge. The key cannot be
            retrieved again — you can only rotate to a new one.
          </p>
          <pre className="mt-2 max-h-32 overflow-x-auto whitespace-pre-wrap break-all rounded bg-bg-base px-2.5 py-2 font-mono text-[11px] text-fg-primary">
            {newKey}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void handleCopy()}>
              Copy to clipboard
            </Button>
            <Button type="button" onClick={handleAcknowledge}>
              I&rsquo;ve copied this — clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* Confirmation dialog — inline rather than modal to keep the panel
          self-contained, matches the existing toggle / delete flows. */}
      {confirmRotate ? (
        <div className="rounded-card border border-danger/30 bg-danger-soft/25 p-3 text-sm text-fg-muted">
          <p className="font-medium text-fg-primary">
            Rotate the signing key?
          </p>
          <p className="mt-1 text-xs">
            The current key will move into the previous slot and stay valid
            for {status?.overlapHours ?? 24}h. After that, only the new key
            verifies. Make sure your receivers know how to read the
            <code className="ml-1 font-mono">X-Blackglass-Signature-Previous</code>{" "}
            header during the overlap window.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="danger" disabled={rotating} onClick={() => void performRotate()}>
              {rotating ? "Rotating…" : "Yes, rotate"}
            </Button>
            <Button type="button" variant="secondary" disabled={rotating} onClick={() => setConfirmRotate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
