"use client";

import { EvidenceExportModal } from "@/app/(app)/evidence/_components/EvidenceExportModal";
import { Card } from "@/components/ui/Card";
import { HostTrustPill } from "@/components/ui/HostTrustPill";
import { ProgressRow } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/Toast";
import type { HostDetail } from "@/data/mock/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { formatAbsoluteUtc, formatRelativeTime } from "@/lib/format-time";

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

export function HostDetailView({ detail }: { detail: HostDetail }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const rawTab = searchParams.get("tab") as TabId | null;
  const tab: TabId = rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : "overview";

  const setTab = useCallback(
    (id: TabId) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", id);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(
      `Delete host "${detail.hostname}" (${detail.id})?\n\n` +
        `This forgets its baseline, drift events, and any matching scan ` +
        `registration. If a push-agent later re-ingests for this host, ` +
        `a fresh baseline will be bootstrapped automatically.\n\n` +
        `This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/hosts/${encodeURIComponent(detail.id)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as {
          detail?: string;
          message?: string;
        };
        toast(
          body.detail ?? body.message ?? `Could not delete host (HTTP ${res.status}).`,
          "danger",
        );
        return;
      }
      toast(`${detail.hostname} deleted.`, "success");
      router.push("/hosts");
      router.refresh();
    } catch {
      toast("Delete failed — network error.", "danger");
    } finally {
      setDeleting(false);
    }
  }, [detail.hostname, detail.id, router, toast]);

  const nextActions = [
    {
      label: "Review baseline diff",
      href: `/baselines?host=${detail.id}`,
    },
    {
      label: "Open drift queue",
      href: `/drift`,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-5 px-6 pb-12 pt-6">
      <PageHeader
        title={detail.id}
        breadcrumbs={[
          { href: "/hosts", label: "Hosts" },
          { href: `/hosts/${detail.id}`, label: detail.id },
        ]}
        actions={
          <>
            <Button type="button">Re-scan</Button>
            <Link href={`/baselines?host=${detail.id}`}>
              <Button variant="secondary" type="button">
                Compare baseline
              </Button>
            </Link>
            <EvidenceExportModal triggerLabel="Export bundle" />
            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleDelete()}
              title="Forget this host: delete its baseline, drift events, and any scan registration. Cannot be undone."
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-fg-faint transition-colors hover:bg-danger-soft/30 hover:text-danger disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </>
        }
      />

      <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
        <HostTrustPill trust={detail.trust} />
        <span>{detail.os}</span>
        <span aria-hidden className="text-fg-faint">·</span>
        <span>
          baseline <span className="font-mono text-fg-primary">{detail.baselineLabel}</span>
        </span>
        <span aria-hidden className="text-fg-faint">·</span>
        <span title={detail.lastScanAt ? formatAbsoluteUtc(detail.lastScanAt) : undefined}>
          last scan {detail.lastScanAt ? formatRelativeTime(detail.lastScanAt) : "Never"}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border-subtle">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 pb-2.5 pt-1 text-sm transition-colors ${
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
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
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
          </div>
        </Card>
      )}

      {tab === "services" && (
        <Card title="systemd units">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
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
          </div>
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
          <ul className="space-y-2 text-sm text-fg-primary">
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
          <div className="mt-5 flex flex-wrap gap-2">
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
                <p className="text-xs text-fg-faint" title={formatAbsoluteUtc(e.at)}>
                  {formatRelativeTime(e.at)}
                </p>
                <p className="mt-1 text-sm text-fg-muted">{e.detail}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
