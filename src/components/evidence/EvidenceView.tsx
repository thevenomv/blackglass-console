"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface EvidenceBundle {
  id: string;
  title: string;
  scope: string;
  createdAt: string;
  sha256: string;
}

const BUNDLES: EvidenceBundle[] = [
  {
    id: "bundle-production-weekly",
    title: "production-weekly",
    scope: "Fleet · prod",
    createdAt: "2026-05-01 08:12 UTC",
    sha256: "e3b0c44298fc1c14",
  },
  {
    id: "bundle-host-07-incident",
    title: "host-07-incident",
    scope: "host-07",
    createdAt: "2026-04-30 21:03 UTC",
    sha256: "a9f12bde045c7e3a",
  },
  {
    id: "bundle-network-seg-audit",
    title: "network-seg-audit",
    scope: "Fleet · segment-b",
    createdAt: "2026-04-28 14:55 UTC",
    sha256: "7d4e2a1f98b0c31d",
  },
  {
    id: "bundle-compliance-q1",
    title: "compliance-q1",
    scope: "Fleet · all",
    createdAt: "2026-04-01 00:00 UTC",
    sha256: "2b4f8c9d11e3a70f",
  },
];

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

export function EvidenceView() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return BUNDLES;
    return BUNDLES.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.scope.toLowerCase().includes(q) ||
        b.sha256.toLowerCase().includes(q),
    );
  }, [query]);

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
            {filtered.length} of {BUNDLES.length}
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-fg-faint">
                  No bundles match &ldquo;{query}&rdquo;
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr key={b.id} className="hover:bg-bg-elevated">
                  <td className="px-4 py-3 text-fg-primary">{b.title}</td>
                  <td className="px-4 py-3 text-fg-muted">{b.scope}</td>
                  <td className="px-4 py-3 text-fg-muted">{b.createdAt}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-fg-faint">{b.sha256}…</span>
                    <CopySha256 sha256={b.sha256} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/api/v1/evidence/bundles/${b.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-accent-blue hover:underline"
                      >
                        Meta
                      </Link>
                      <Link
                        href={`/api/v1/evidence/bundles/${b.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-accent-blue hover:underline"
                      >
                        Artifact
                      </Link>
                    </div>
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
