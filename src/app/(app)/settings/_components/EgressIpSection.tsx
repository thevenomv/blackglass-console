"use client";

import { useState } from "react";

type Props = {
  /** Comma-separated egress IPs injected from the server. Empty string when not configured. */
  egressIps: string;
};

export function EgressIpSection({ egressIps }: Props) {
  const ips = egressIps
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(ips.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
            onClick={() => void copyAll()}
            className="text-xs text-accent-blue hover:underline focus:outline-none"
          >
            {copied ? "Copied!" : "Copy all"}
          </button>
        )}
      </div>
      <p className="text-sm text-fg-muted">
        BLACKGLASS connects to your servers from these IP addresses. Add them to your
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
    </section>
  );
}
