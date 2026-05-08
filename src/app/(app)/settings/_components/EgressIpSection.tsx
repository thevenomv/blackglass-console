"use client";

import { useState } from "react";

type Props = {
  /** Comma-separated egress IPs injected from the server. Empty string when not configured. */
  egressIps: string;
  /**
   * Optional comma-separated "next set" — IPs the operator is about to cut
   * over to. When populated, the public /api/public/egress-ips endpoint
   * surfaces both lists so customers can pre-allowlist the new IPs before
   * the cutover. Empty string when no rotation is in flight.
   */
  nextEgressIps?: string;
  /** ISO 8601 timestamp of the planned NAT rotation. Empty when no rotation scheduled. */
  rotatesAt?: string;
};

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatRotates(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(d) + " UTC";
  } catch {
    return iso;
  }
}

export function EgressIpSection({ egressIps, nextEgressIps = "", rotatesAt = "" }: Props) {
  const ips = parseList(egressIps);
  const nextIps = parseList(nextEgressIps);
  const rotates = formatRotates(rotatesAt);
  const [copied, setCopied] = useState<"current" | "next" | "url" | null>(null);

  const copy = (label: "current" | "next" | "url", text: string) => async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard unavailable (non-HTTPS dev env) — ignore
    }
  };

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-primary">Collector egress IPs</h2>
        {ips.length > 0 && (
          <button
            type="button"
            onClick={() => void copy("current", ips.join("\n"))()}
            className="text-xs text-accent-blue hover:underline focus:outline-none"
          >
            {copied === "current" ? "Copied!" : "Copy all"}
          </button>
        )}
      </div>
      <p className="text-sm text-fg-muted">
        Blackglass connects to your servers from these IP addresses. Add them to your
        firewall allowlist on port&nbsp;22 so the collector can reach each host.
      </p>

      {ips.length > 0 ? (
        <ul className="divide-y divide-border-subtle rounded-card border border-border-subtle bg-bg-base text-sm font-mono">
          {ips.map((ip) => (
            <li key={ip} className="flex items-center justify-between px-4 py-2">
              <span className="text-fg-primary">{ip}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(ip).catch(() => {});
                }}
                className="ml-4 shrink-0 text-xs text-fg-faint hover:text-fg-muted focus:outline-none"
                aria-label={`Copy ${ip}`}
              >
                Copy
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-card border border-border-subtle bg-bg-base px-4 py-3 text-sm text-fg-muted">
          <p>
            No egress IPs are configured.{" "}
            <span className="text-fg-faint">
              Set <code className="font-mono text-[11px]">COLLECTOR_EGRESS_IPS</code> to a
              comma-separated list of your worker&apos;s NAT / floating IP addresses and they
              will appear here for easy customer allowlisting.
            </span>
          </p>
        </div>
      )}

      {nextIps.length > 0 ? (
        <div className="rounded-card border border-warning/30 bg-warning-soft/25 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning">
              Rotation pending {rotates ? `· ${rotates}` : ""}
            </p>
            <button
              type="button"
              onClick={() => void copy("next", nextIps.join("\n"))()}
              className="text-xs text-accent-blue hover:underline focus:outline-none"
            >
              {copied === "next" ? "Copied!" : "Copy next set"}
            </button>
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            We&rsquo;ll start sourcing collector traffic from the IPs below.
            Pre-allowlist them now so the cutover is invisible to your hosts.
          </p>
          <ul className="mt-2 space-y-0.5 font-mono text-xs text-fg-primary">
            {nextIps.map((ip) => (
              <li key={`next-${ip}`}>{ip}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-card border border-border-subtle bg-bg-elevated p-3 text-xs text-fg-muted">
        <p className="font-medium text-fg-primary">
          Public endpoint for firewall automation
        </p>
        <p className="mt-1">
          The same list is published at{" "}
          <code className="font-mono text-[11px] text-fg-primary">
            /api/public/egress-ips
          </code>{" "}
          (unauthenticated, cached 5 minutes). Point your CMDB / Terraform /
          Ansible inventory at it to auto-update allowlists when we rotate.
        </p>
        <button
          type="button"
          onClick={() =>
            void copy("url", `${window.location.origin}/api/public/egress-ips`)()
          }
          className="mt-2 text-xs text-accent-blue hover:underline focus:outline-none"
        >
          {copied === "url" ? "Copied!" : "Copy endpoint URL"}
        </button>
      </div>
    </section>
  );
}
