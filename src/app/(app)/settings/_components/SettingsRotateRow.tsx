"use client";

import { PermissionGate } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type KeysResponse = {
  pushIngestConfigured?: boolean;
  sharedKeyMasked?: string | null;
  perHostKeyCount?: number;
  mode?: string;
  sshCollectorConfigured?: boolean;
};

export function SettingsRotateRow() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [meta, setMeta] = useState<KeysResponse | null>(null);
  const [rotating, setRotating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const reloadMetaQuiet = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/collector/keys");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as KeysResponse;
      setMeta(data);
    } catch {
      setMeta(null);
      toastRef.current("Could not load ingest key metadata.", "danger");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/collector/keys");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as KeysResponse;
        if (!cancelled) setMeta(data);
      } catch {
        if (!cancelled) {
          setMeta(null);
          toastRef.current("Could not load ingest key metadata.", "danger");
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const masked =
    meta?.sharedKeyMasked ??
    (meta?.perHostKeyCount && meta.perHostKeyCount > 0 ? "Per-host keys only — see INGEST_HOST_KEYS_JSON" : null);

  const handleRotate = async () => {
    setRevealedKey(null);
    setRotating(true);
    try {
      const res = await fetch("/api/v1/collector/keys/rotate", { method: "POST" });
      let body: { api_key?: string; detail?: string; error?: string } = {};
      try {
        body = (await res.json()) as { api_key?: string; detail?: string; error?: string };
      } catch {
        /* non-JSON error body */
      }
      if (!res.ok) {
        toast(body.detail ?? body.error ?? "Rotation failed.", "danger");
        return;
      }
      if (body.api_key) {
        setRevealedKey(body.api_key);
        toast("New key issued — copy it below and update INGEST_API_KEY, then restart.", "success");
      } else {
        toast(body.detail ?? "Rotation completed.", "success");
      }
      void reloadMetaQuiet();
    } catch {
      toast("Rotation request failed — try again.", "danger");
    } finally {
      setRotating(false);
    }
  };

  const copyKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      toast("Copied to clipboard", "success");
    } catch {
      toast("Copy failed — select the key manually", "danger");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-faint">
        Used by the optional <strong className="text-fg-muted">push-ingest</strong> agent as{" "}
        <code className="rounded bg-bg-base px-1 font-mono text-[11px]">Authorization: Bearer …</code>
        against <code className="rounded bg-bg-base px-1 font-mono text-[11px]">POST /api/v1/ingest</code>. SSH-based
        collection uses <code className="rounded bg-bg-base px-1 font-mono text-[11px]">COLLECTOR_HOST_*</code> in the
        deployment environment — see{" "}
        <Link href="/welcome" className="text-accent-blue underline underline-offset-2 hover:underline">
          Get started
        </Link>
        .
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          readOnly
          value={
            loadingMeta
              ? "Loading…"
              : masked ?? (meta?.sshCollectorConfigured ? "No push-ingest key set (SSH collection only)" : "Not configured")
          }
          className="min-w-[12rem] flex-1 rounded-card border border-border-default bg-bg-base px-3 py-2 font-mono text-sm text-fg-muted"
          aria-label="Masked push ingest API key"
        />
        <PermissionGate
          action="rotateKeys"
          fallback={
            <Button variant="secondary" type="button" disabled title="Operator or admin role required">
              Issue new key
            </Button>
          }
        >
          <Button variant="secondary" type="button" disabled={rotating || loadingMeta} onClick={() => void handleRotate()}>
            {rotating ? "Issuing…" : "Issue new key"}
          </Button>
        </PermissionGate>
      </div>

      {revealedKey ? (
        <div className="space-y-2 rounded-card border border-warning/40 bg-warning-soft/25 p-3">
          <p className="text-xs font-medium text-fg-primary">Copy this key once — it replaces the previous one after you deploy</p>
          <div className="flex flex-wrap gap-2">
            <input readOnly value={revealedKey} className="min-w-0 flex-1 rounded border border-border-default bg-bg-base px-2 py-1.5 font-mono text-xs text-fg-primary" />
            <Button type="button" variant="secondary" className="shrink-0 text-xs" onClick={() => void copyKey()}>
              Copy
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}