"use client";

/**
 * ApiKeysSection — settings card for managing CI/CD API keys.
 *
 * Keys are used with Authorization: Bearer <key> to call scans and drift APIs
 * from CI/CD pipelines without a browser session.
 *
 * The raw key is shown once on creation and never recoverable.
 */

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useEffect, useRef, useState } from "react";

interface ApiKey {
  id: string;
  label: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
}

interface CreateResponse {
  key: ApiKey & { rawKey: string };
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ApiKeysSection() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState<string>("365");
  const [creating, setCreating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const rawKeyRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/v1/api-keys")
      .then((r) => r.json())
      .then((d: { keys?: ApiKey[] }) => setKeys(d.keys ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createKey = async () => {
    if (!label.trim()) {
      toast("Enter a label for the key.", "warning");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          scopes: ["scans.run", "drift.read", "baselines.read"],
          expiresInDays: expiry ? parseInt(expiry, 10) : undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as CreateResponse;
      setNewRawKey(data.key.rawKey);
      setShowForm(false);
      setLabel("");
      load();
    } catch {
      toast("Failed to create API key.", "danger");
    } finally {
      setCreating(false);
    }
  };

  const copyRawKey = async () => {
    if (!newRawKey) return;
    try {
      await navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast("API key copied to clipboard.", "success");
    } catch {
      rawKeyRef.current?.select();
    }
  };

  const revokeKey = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/v1/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      toast("Key revoked.", "success");
      load();
    } catch {
      toast("Failed to revoke key.", "danger");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Raw key reveal panel */}
      {newRawKey && (
        <div className="rounded-card border border-success/40 bg-success-soft/20 p-4">
          <p className="mb-2 text-sm font-semibold text-fg-primary">
            Copy your API key — it won&apos;t be shown again.
          </p>
          <div className="flex gap-2">
            <input
              ref={rawKeyRef}
              type="text"
              readOnly
              value={newRawKey}
              className="flex-1 rounded-card border border-border-default bg-bg-base px-3 py-2 font-mono text-xs text-fg-primary"
              aria-label="New API key"
            />
            <Button variant="secondary" type="button" onClick={() => void copyRawKey()}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setNewRawKey(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-8 animate-pulse rounded-card bg-bg-elevated" />
      ) : keys.length === 0 ? (
        <p className="text-sm text-fg-muted">No API keys yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-card border border-border-default">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg-primary">{k.label}</p>
                <p className="mt-0.5 text-[11px] text-fg-faint">
                  Created {formatDate(k.createdAt)} · Last used: {formatDate(k.lastUsedAt)}
                  {k.expiresAt ? ` · Expires: ${formatDate(k.expiresAt)}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={deleting === k.id}
                onClick={() => void revokeKey(k.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-fg-faint transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                aria-label={`Revoke key ${k.label}`}
              >
                {deleting === k.id ? "…" : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div className="space-y-2 rounded-card border border-border-default bg-bg-panel p-4">
          <input
            type="text"
            placeholder="Key label (e.g. GitHub Actions deploy)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-fg-muted">Expires in</label>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="rounded-card border border-border-default bg-bg-base px-2 py-1.5 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="730">2 years</option>
              <option value="">Never</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" type="button" disabled={creating} onClick={() => void createKey()}>
              {creating ? "Creating…" : "Create key"}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" type="button" onClick={() => setShowForm(true)}>
          + New API key
        </Button>
      )}
    </div>
  );
}
