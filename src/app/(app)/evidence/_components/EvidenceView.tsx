"use client";

import { useMemo, useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";

export interface BundleListItem {
  id: string;
  title: string;
  scope: string;
  sha256: string;
  generatedBy: string | null;
  createdAt: string;
}

function CopySha256({ sha256 }: { sha256: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sha256);
      setCopied(true);
      toast("SHA256 copied to clipboard.", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Copy failed — select and copy manually.", "warning");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title="Copy full SHA256"
      aria-label={`Copy SHA256 for bundle (${sha256})`}
      className="ml-1.5 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-fg-faint transition-colors hover:bg-bg-elevated hover:text-fg-muted"
    >
      {copied ? (
        <>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

export function EvidenceView({ refreshSignal }: { refreshSignal?: number }) {
  const [bundles, setBundles] = useState<BundleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/v1/evidence/bundles")
      .then((r) => r.json())
      .then((data: { bundles?: BundleListItem[] }) => {
        if (!cancelled) setBundles(data.bundles ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load bundles.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshSignal]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return bundles;
    return bundles.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.scope.toLowerCase().includes(q) ||
        b.sha256.toLowerCase().includes(q),
    );
  }, [query, bundles]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Filter by title, scope or SHA256…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-card border border-border-default bg-bg-base py-2 pl-8 pr-3 text-sm text-fg-primary placeholder:text-fg-faint focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
            aria-label="Search evidence bundles"
          />
        </div>
        {query ? (
          <span className="text-xs text-fg-faint">
            {filtered.length} of {bundles.length}
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-card border border-border-default">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border-subtle bg-bg-panel text-xs uppercase tracking-wide text-fg-faint">
            <tr>
              <th className="px-4 py-3 font-medium">Bundle</th>
              <th className="px-4 py-3 font-medium">Scope</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">SHA256</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-bg-panel">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-fg-faint">
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-fg-faint">
                  {error}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-fg-faint">
                  {query.trim()
                    ? <>No bundles match &ldquo;{query}&rdquo;</>
                    : "No evidence bundles yet — generate one from the button above."}
                </td>
              </tr>
            ) : (
              filtered.map((b, i) => (
                <tr
                  key={b.id}
                  className={`hover:bg-bg-elevated ${i % 2 === 1 ? "bg-bg-elevated/35" : ""}`}
                >
                  <td className="px-4 py-3 text-fg-primary">{b.title}</td>
                  <td className="px-4 py-3 text-fg-muted">{b.scope === "all" ? "All hosts" : b.scope}</td>
                  <td className="px-4 py-3 text-fg-muted">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-fg-faint">{b.sha256.slice(0, 16)}…</span>
                    <CopySha256 sha256={b.sha256} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/api/v1/evidence/bundles/${b.id}/file`}
                      download
                      className="text-xs font-semibold text-accent-blue hover:underline"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}