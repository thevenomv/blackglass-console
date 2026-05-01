"use client";

import { EvidenceExportModal } from "@/components/evidence/EvidenceExportModal";
import { Card } from "@/components/ui/Card";
import { HostTrustPill } from "@/components/ui/HostTrustPill";
import { ProgressRow } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import type { HostDetail } from "@/data/mock/types";
import Link from "next/link";
import { useState } from "react";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "ports", label: "Ports" },
  { id: "users", label: "Users / groups" },
  { id: "services", label: "Services" },
  { id: "ssh-firewall", label: "SSH / firewall" },
  { id: "evidence", label: "Evidence" },
  { id: "history", label: "History" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function formatTs(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function HostDetailView({ detail }: { detail: HostDetail }) {
  const [tab, setTab] = useState<TabId>("overview");

  const nextActions = [
    {
      label: "Review baseline diff",
      href: `/baselines?host=${detail.id}`,
    },
    {
      label: "Open drift queue",
      href: `/drift`,
    },
    {
      label: "Schedule privileged re-scan",
      href: "/settings",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6 px-6 pb-12 pt-6">
      <nav className="text-xs text-fg-faint">
        <Link href="/hosts" className="hover:text-fg-muted">
          Hosts
        </Link>
        <span className="px-2 text-fg-faint">/</span>
        <span className="font-mono text-fg-muted">{detail.id}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-semibold text-fg-primary">{detail.id}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {detail.os} · baseline{" "}
            <span className="font-mono text-fg-primary">{detail.baselineLabel}</span>
          </p>
          <p className="mt-1 text-xs text-fg-faint">
            Last scan {formatTs(detail.lastScanAt)} UTC
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HostTrustPill trust={detail.trust} />
          <EvidenceExportModal triggerLabel="Export integrity snapshot" />
          <Button type="button">Re-scan</Button>
          <Link href={`/baselines?host=${detail.id}`}>
            <Button variant="secondary" type="button">
              Compare to baseline
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border-subtle">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 pb-3 pt-1 text-sm transition-colors ${
              tab === t.id
                ? "border-accent-blue text-fg-primary"
                : "border-transparent text-fg-muted hover:text-fg-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Baseline alignment" className="lg:col-span-2">
            <div className="grid gap-4 md:grid-cols-2">
              <ProgressRow
                label="Network listener investigation"
                value={detail.integrityBars.networkListenersInvestigation}
              />
              <ProgressRow
                label="User / group drift surface"
                value={detail.integrityBars.userGroupDrift}
              />
              <ProgressRow
                label="Systemd persistence exposure"
                value={detail.integrityBars.systemdPersistence}
              />
              <ProgressRow
                label="Evidence completeness"
                value={detail.integrityBars.evidenceCompleteness}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-fg-faint">
              Percentages reflect how much signal remains open versus the approved baseline — not
              abstract performance scores.
            </p>
          </Card>

          <Card title="Next actions">
            <ul className="space-y-3 text-sm text-fg-muted">
              {nextActions.map((a) => (
                <li key={a.label}>
                  <Link href={a.href} className="text-accent-blue hover:underline">
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-fg-faint">
              Use exports for incident folders; diff view anchors remediation discussions.
            </p>
          </Card>

          <Card title="Drift concentration" className="lg:col-span-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(detail.deltaCounts).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-base/40 px-3 py-2"
                >
                  <span className="text-sm text-fg-muted">{k}</span>
                  <span className="font-mono text-sm tabular-nums text-fg-primary">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "ports" && (
        <Card title="Listening sockets">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-fg-faint">
                <tr>
                  <th className="pb-2 font-medium">Proto</th>
                  <th className="pb-2 font-medium">Bind</th>
                  <th className="pb-2 font-medium">Port</th>
                  <th className="pb-2 font-medium">Process</th>
                  <th className="pb-2 font-medium">Baseline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {detail.ports.map((p) => (
                  <tr key={`${p.proto}-${p.bind}-${p.port}`} className="hover:bg-bg-elevated">
                    <td className="py-2 font-mono text-fg-muted">{p.proto}</td>
                    <td className="py-2 font-mono text-fg-primary">{p.bind}</td>
                    <td className="py-2 font-mono text-fg-primary">{p.port}</td>
                    <td className="py-2 font-mono text-fg-muted">{p.process ?? "—"}</td>
                    <td className="py-2">
                      <span
                        className={
                          p.baselineMatch ? "text-success text-xs font-medium" : "text-danger text-xs font-medium"
                        }
                      >
                        {p.baselineMatch ? "Aligned" : "Drift"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "users" && (
        <Card title="Local users">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-fg-faint">
              <tr>
                <th className="pb-2 font-medium">User</th>
                <th className="pb-2 font-medium">UID</th>
                <th className="pb-2 font-medium">Groups</th>
                <th className="pb-2 font-medium">Sudo-capable</th>
                <th className="pb-2 font-medium">Baseline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {detail.users.map((u) => (
                <tr key={u.user} className="hover:bg-bg-elevated">
                  <td className="py-2 font-mono text-fg-primary">{u.user}</td>
                  <td className="py-2 font-mono text-fg-muted">{u.uid}</td>
                  <td className="py-2 font-mono text-xs text-fg-muted">{u.groups.join(", ")}</td>
                  <td className="py-2 text-fg-muted">{u.sudoCapable ? "yes" : "no"}</td>
                  <td className="py-2">
                    <span
                      className={
                        u.baselineMatch ? "text-xs font-medium text-success" : "text-xs font-medium text-danger"
                      }
                    >
                      {u.baselineMatch ? "Aligned" : "Drift"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "services" && (
        <Card title="systemd units">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-fg-faint">
              <tr>
                <th className="pb-2 font-medium">Unit</th>
                <th className="pb-2 font-medium">State</th>
                <th className="pb-2 font-medium">Enabled</th>
                <th className="pb-2 font-medium">Baseline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {detail.services.map((s) => (
                <tr key={s.unit} className="hover:bg-bg-elevated">
                  <td className="py-2 font-mono text-fg-primary">{s.unit}</td>
                  <td className="py-2 text-fg-muted">{s.state}</td>
                  <td className="py-2 text-fg-muted">{s.enabled ? "yes" : "no"}</td>
                  <td className="py-2">
                    <span
                      className={
                        s.baselineMatch ? "text-xs font-medium text-success" : "text-xs font-medium text-warning"
                      }
                    >
                      {s.baselineMatch ? "Aligned" : "Review"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "ssh-firewall" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="SSH posture">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">PermitRootLogin</dt>
                <dd className="font-mono text-fg-primary">{detail.sshFirewall.sshPermitRoot}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Password authentication</dt>
                <dd className="text-fg-primary">
                  {detail.sshFirewall.sshPasswordAuth ? "enabled" : "disabled"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Baseline match</dt>
                <dd
                  className={
                    detail.sshFirewall.baselineMatchSsh ? "text-success font-medium" : "text-danger font-medium"
                  }
                >
                  {detail.sshFirewall.baselineMatchSsh ? "Yes" : "No"}
                </dd>
              </div>
            </dl>
          </Card>
          <Card title="Firewall">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Backend</dt>
                <dd className="font-mono text-fg-primary">{detail.sshFirewall.firewallBackend}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Default INPUT policy</dt>
                <dd className="font-mono text-fg-primary">{detail.sshFirewall.defaultPolicy}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">Baseline match</dt>
                <dd
                  className={
                    detail.sshFirewall.baselineMatchFw ? "text-success font-medium" : "text-danger font-medium"
                  }
                >
                  {detail.sshFirewall.baselineMatchFw ? "Yes" : "No"}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {tab === "evidence" && (
        <Card title="Evidence readiness">
          <p className="text-sm text-fg-muted">
            These artifacts roll into an integrity bundle for auditors or incident leads.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-fg-primary">
            <li className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2">
              Listener enumeration snapshot
              <span className="text-xs font-medium text-success">Captured</span>
            </li>
            <li className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2">
              passwd/group excerpts (redacted)
              <span className="text-xs font-medium text-success">Captured</span>
            </li>
            <li className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2">
              systemd enablement matrix
              <span className="text-xs font-medium text-warning">Partial</span>
            </li>
            <li className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2">
              nftables ruleset digest
              <span className="text-xs font-medium text-danger">Missing</span>
            </li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            <EvidenceExportModal triggerLabel="Prepare bundle" />
          </div>
        </Card>
      )}

      {tab === "history" && (
        <Card title="Drift timeline">
          <ol className="space-y-4 border-l border-border-default pl-4">
            {detail.timeline.map((e) => (
              <li key={`${e.at}-${e.label}`} className="relative">
                <span className="absolute -left-[21px] mt-1 h-2.5 w-2.5 rounded-full bg-accent-blue" />
                <p className="text-sm font-medium text-fg-primary">{e.label}</p>
                <p className="text-xs text-fg-faint">{formatTs(e.at)} UTC</p>
                <p className="mt-1 text-sm text-fg-muted">{e.detail}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
