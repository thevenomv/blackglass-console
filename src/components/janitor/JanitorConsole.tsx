"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { hasPermission } from "@/lib/saas/permissions";
import {
  janitorProviderLabel,
  type JanitorCloudProvider,
} from "@/lib/janitor/providers";
import { janitorFindingConsoleUrl } from "@/lib/janitor/cloud-console-links";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

function formatCharonDiffSummary(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "—";
  const c = (raw as { counts?: { added?: number; removed?: number; scoreChanged?: number } }).counts;
  if (!c) return "—";
  return `+${c.added ?? 0} · −${c.removed ?? 0} · ~${c.scoreChanged ?? 0}`;
}

function charonDiffTooltip(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const scannedAt = (raw as { scannedAt?: string }).scannedAt;
  if (!scannedAt) return undefined;
  return `Diff vs previous successful scan (as of ${new Date(scannedAt).toLocaleString()})`;
}

type Entitlements = {
  linkedAccountsMax: number;
  cleanupQueue: boolean;
  liveCleanup: boolean;
  scheduledScansAllowed: boolean;
  charonAddon: boolean;
};

type AccountRow = {
  id: string;
  provider: string;
  accountName: string;
  scopesVerified: string[];
  lastScanAt: string | null;
  lastScanStatus?: string | null;
  lastScanError?: string | null;
  lastScanDiff?: unknown;
  scanSchedule: string;
  createdAt: string;
};

type FindingRow = {
  id: string;
  accountId: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  idleScore: number;
  estimatedWasteMonthly: string;
  tags: Record<string, string> | null;
  metricsMeta?: Record<string, unknown> | null;
  provider?: string;
  createdAt: string;
};

type CleanupRow = {
  id: string;
  findingId: string;
  status: string;
  mode: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  resourceType: string;
  resourceName: string;
  resourceId: string;
};

type SuppressionRow = {
  id: string;
  accountId: string;
  resourceType: string;
  resourceId: string;
  kind: string;
  snoozeUntil: string | null;
  note: string | null;
  createdAt: string;
};

type Tab = "accounts" | "findings" | "cleanup" | "suppressions";

export function JanitorConsole() {
  const { tenantRole } = useSession();
  const canManage = tenantRole !== null && hasPermission(tenantRole, "janitor.manage");

  const [tab, setTab] = useState<Tab>("accounts");
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [cleanupRows, setCleanupRows] = useState<CleanupRow[]>([]);
  const [suppressionRows, setSuppressionRows] = useState<SuppressionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [linkProvider, setLinkProvider] = useState<JanitorCloudProvider>("do");
  const [scanSchedule, setScanSchedule] = useState<"manual" | "daily" | "weekly">("manual");

  const [filterAccountId, setFilterAccountId] = useState("");
  const [filterResourceType, setFilterResourceType] = useState("");
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(() => new Set());
  const [cleanupMode, setCleanupMode] = useState<"dry_run" | "live">("dry_run");

  const [policyMinScore, setPolicyMinScore] = useState("");
  const [policyEmailDigest, setPolicyEmailDigest] = useState(false);
  const [policyWebhookOnScan, setPolicyWebhookOnScan] = useState(false);
  const [policyExcludeTags, setPolicyExcludeTags] = useState("");
  const [policyProtectTags, setPolicyProtectTags] = useState("");

  const loadAccounts = useCallback(async () => {
    const aRes = await fetch("/api/v1/janitor/accounts", { credentials: "same-origin" });
    if (!aRes.ok) {
      const j = await aRes.json().catch(() => ({}));
      throw new Error((j as { detail?: string }).detail ?? "Failed to load accounts");
    }
    const aJson = (await aRes.json()) as { accounts: AccountRow[]; entitlements?: Entitlements };
    setAccounts(aJson.accounts);
    if (aJson.entitlements) setEntitlements(aJson.entitlements);
  }, []);

  const loadFindings = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(pagination.page));
    params.set("pageSize", String(pagination.pageSize));
    if (filterAccountId) params.set("accountId", filterAccountId);
    if (filterResourceType) params.set("resourceType", filterResourceType);
    const fRes = await fetch(`/api/v1/janitor/findings?${params}`, { credentials: "same-origin" });
    if (!fRes.ok) {
      const j = await fRes.json().catch(() => ({}));
      throw new Error((j as { detail?: string }).detail ?? "Failed to load findings");
    }
    const fJson = (await fRes.json()) as {
      findings: FindingRow[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    };
    setFindings(fJson.findings);
    setPagination(fJson.pagination);
  }, [pagination.page, pagination.pageSize, filterAccountId, filterResourceType]);

  const loadCleanup = useCallback(async () => {
    const cRes = await fetch("/api/v1/janitor/cleanup-requests", { credentials: "same-origin" });
    if (!cRes.ok) {
      const j = await cRes.json().catch(() => ({}));
      throw new Error((j as { detail?: string }).detail ?? "Failed to load cleanup queue");
    }
    const cJson = (await cRes.json()) as { requests: CleanupRow[] };
    setCleanupRows(cJson.requests);
  }, []);

  const loadSuppressions = useCallback(async () => {
    const sRes = await fetch("/api/v1/janitor/suppressions", { credentials: "same-origin" });
    if (!sRes.ok) {
      const j = await sRes.json().catch(() => ({}));
      throw new Error((j as { detail?: string }).detail ?? "Failed to load suppressions");
    }
    const sJson = (await sRes.json()) as { suppressions: SuppressionRow[] };
    setSuppressionRows(sJson.suppressions);
  }, []);

  const loadPolicies = useCallback(async () => {
    const pRes = await fetch("/api/v1/janitor/policies", { credentials: "same-origin" });
    if (!pRes.ok) return;
    const pJson = (await pRes.json()) as {
      policies: {
        minIdleScore?: number;
        emailDigestOnScan?: boolean;
        webhookOnScan?: boolean;
        excludeTagsLower?: string[];
        protectTagsExtraLower?: string[];
      };
    };
    const p = pJson.policies ?? {};
    setPolicyMinScore(typeof p.minIdleScore === "number" ? String(p.minIdleScore) : "");
    setPolicyEmailDigest(p.emailDigestOnScan === true);
    setPolicyWebhookOnScan(p.webhookOnScan === true);
    setPolicyExcludeTags((p.excludeTagsLower ?? []).join(", "));
    setPolicyProtectTags((p.protectTagsExtraLower ?? []).join(", "));
  }, []);

  const loadAll = useCallback(async () => {
    setErr(null);
    try {
      await loadAccounts();
      await loadPolicies();
      await loadFindings();
      await loadCleanup();
      await loadSuppressions();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [loadAccounts, loadPolicies, loadFindings, loadCleanup, loadSuppressions]);

  useEffect(() => {
    // Initial Charon load — `loadAll` sets React state from API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only fetch
    void loadAll();
  }, [loadAll]);

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy("add");
    setErr(null);
    try {
      const res = await fetch("/api/v1/janitor/accounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: linkProvider,
          accountName: name.trim(),
          apiToken: token.trim(),
          scanSchedule,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { detail?: string }).detail ?? "Could not save account");
      }
      setName("");
      setToken("");
      setLinkProvider("do");
      setScanSchedule("manual");
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function savePolicies(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy("policies");
    setErr(null);
    try {
      const excludeTagsLower = policyExcludeTags
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const protectTagsExtraLower = policyProtectTags
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const minRaw = policyMinScore.trim();
      const minIdleScore =
        minRaw === "" ? null : Math.max(0, Math.min(100, parseInt(minRaw, 10) || 0));
      const res = await fetch("/api/v1/janitor/policies", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          excludeTagsLower,
          protectTagsExtraLower,
          minIdleScore,
          emailDigestOnScan: policyEmailDigest,
          webhookOnScan: policyWebhookOnScan,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { detail?: string }).detail ?? "Could not save policies");
      }
      await loadPolicies();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function runScan(accountId: string) {
    if (!canManage) return;
    setBusy(accountId);
    setErr(null);
    try {
      const res = await fetch("/api/v1/janitor/scan", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { detail?: string }).detail ?? "Scan request failed");
      }
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(null);
    }
  }

  function toggleFinding(id: string) {
    setSelectedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function requestCleanup() {
    if (!canManage || selectedFindings.size === 0 || !entitlements?.cleanupQueue) return;
    setBusy("cleanup");
    setErr(null);
    try {
      const res = await fetch("/api/v1/janitor/cleanup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingIds: [...selectedFindings],
          mode: cleanupMode,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { detail?: string }).detail ?? "Cleanup request failed");
      }
      setSelectedFindings(new Set());
      await loadCleanup();
      setTab("cleanup");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setBusy(null);
    }
  }

  function accountLabel(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.accountName ?? accountId.slice(0, 8);
  }

  async function suppressFinding(findingId: string, kind: "dismiss" | "snooze", snoozeDays?: number) {
    if (!canManage) return;
    setBusy("suppress");
    setErr(null);
    try {
      const res = await fetch("/api/v1/janitor/findings/suppress", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          findingId,
          kind,
          ...(kind === "snooze" && snoozeDays != null ? { snoozeDays } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { detail?: string }).detail ?? "Could not suppress finding");
      }
      await Promise.all([loadFindings(), loadSuppressions()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Suppress failed");
    } finally {
      setBusy(null);
    }
  }

  async function removeSuppression(suppressionId: string) {
    if (!canManage) return;
    setBusy("unsuppress");
    setErr(null);
    try {
      const res = await fetch(
        `/api/v1/janitor/suppressions?id=${encodeURIComponent(suppressionId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { detail?: string }).detail ?? "Could not remove suppression");
      }
      await loadSuppressions();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(null);
    }
  }

  async function approveRequest(id: string, action: "approve" | "reject") {
    if (!canManage) return;
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch("/api/v1/janitor/cleanup/approve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, action }),
      });
      const j = await res.json().catch(() => ({}));
      await loadCleanup();
      if (!res.ok) {
        throw new Error((j as { detail?: string }).detail ?? "Action failed");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    if (findings.length === 0) return;
    const headers = [
      "resourceType",
      "resourceId",
      "resourceName",
      "idleScore",
      "estimatedWasteMonthly",
      "accountId",
      "createdAt",
    ];
    const lines = [headers.join(",")];
    for (const f of findings) {
      lines.push(
        [
          f.resourceType,
          f.resourceId,
          JSON.stringify(f.resourceName),
          String(f.idleScore),
          f.estimatedWasteMonthly,
          f.accountId,
          f.createdAt,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `charon-findings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function idleBadge(score: number): { label: string; tone: "success" | "warning" | "danger" } {
    if (score >= 70) return { label: "Critical", tone: "danger" };
    if (score >= 40) return { label: "Warning", tone: "warning" };
    return { label: "Healthy", tone: "success" };
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "accounts", label: "Accounts" },
    { id: "findings", label: "Findings" },
    { id: "cleanup", label: "Cleanup queue" },
    { id: "suppressions", label: "Suppressions" },
  ];

  return (
    <div className="px-6 pb-14 pt-8 text-fg-primary">
      <header className="mb-8 max-w-3xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Charon</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg-primary">
          Cloud resource hygiene
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Link DigitalOcean, AWS, or GCP for inventory and idle scoring. Request cleanup (dry-run by
          default); live deletes and Slack approvals are available when your plan allows them.
        </p>
        {entitlements?.charonAddon ? (
          <p className="mt-3 rounded-lg border border-accent-blue/25 bg-accent-blue-soft px-3 py-2 text-xs text-accent-blue">
            Charon add-on is active on this workspace — boosted linked-account limits and cleanup
            access apply.
          </p>
        ) : null}
      </header>

      {err ? (
        <div className="mb-6 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {err}
        </div>
      ) : null}

      <div className="mb-6 inline-flex rounded-full border border-border-default bg-bg-panel-elevated p-1 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? "bg-bg-panel text-fg-primary shadow-sm"
                : "text-fg-muted hover:text-fg-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <div className="space-y-8">
          {canManage ? (
            <Card title="Workspace policies">
              <p className="mb-4 text-sm text-fg-muted">
                Filter findings after each scan, add protector tag keywords, optionally email a digest
                when scans produce findings, and optionally POST a signed{" "}
                <span className="font-mono text-fg-primary">charon.scan.completed</span> JSON event to
                your tenant webhook URLs after every successful scan.
              </p>
              <form className="flex max-w-lg flex-col gap-3" onSubmit={savePolicies}>
                <label className="text-xs font-medium text-fg-muted">
                  Minimum idle score (1–100, blank = none)
                  <input
                    className="mt-1 w-full rounded-md border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-1"
                    value={policyMinScore}
                    onChange={(e) => setPolicyMinScore(e.target.value)}
                    placeholder="e.g. 40"
                    inputMode="numeric"
                  />
                </label>
                <label className="text-xs font-medium text-fg-muted">
                  Exclude tag names (comma-separated, case-insensitive match on keys or values)
                  <input
                    className="mt-1 w-full rounded-md border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-1"
                    value={policyExcludeTags}
                    onChange={(e) => setPolicyExcludeTags(e.target.value)}
                    placeholder="staging, dev"
                  />
                </label>
                <label className="text-xs font-medium text-fg-muted">
                  Extra protector tag names (comma-separated)
                  <input
                    className="mt-1 w-full rounded-md border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-1"
                    value={policyProtectTags}
                    onChange={(e) => setPolicyProtectTags(e.target.value)}
                    placeholder="cost-center-keep"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-fg-muted">
                  <input
                    type="checkbox"
                    checked={policyEmailDigest}
                    onChange={(e) => setPolicyEmailDigest(e.target.checked)}
                    className="rounded border-border-default"
                  />
                  Email digest after scans with findings (uses drift alert email list)
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-fg-muted">
                  <input
                    type="checkbox"
                    checked={policyWebhookOnScan}
                    onChange={(e) => setPolicyWebhookOnScan(e.target.checked)}
                    className="rounded border-border-default"
                  />
                  Webhook on scan (tenant webhook URLs + HMAC; includes diff summary)
                </label>
                <Button type="submit" disabled={busy !== null}>
                  {busy === "policies" ? "Saving…" : "Save policies"}
                </Button>
              </form>
            </Card>
          ) : null}
          {canManage ? (
            <Card title="Link cloud account">
              <p className="mb-4 text-sm text-fg-muted">
                Credentials are envelope-encrypted per workspace and never returned by the API.
                DigitalOcean tokens are validated against the live API. AWS and GCP expect shaped
                JSON (access keys or service-account material); scans call vendor read APIs from our
                service to build inventory and idle scores.
              </p>
              <form className="flex max-w-lg flex-col gap-3" onSubmit={addAccount}>
                <label className="text-xs font-medium text-fg-muted">
                  Provider
                  <select
                    className="mt-1 w-full rounded-md border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary"
                    value={linkProvider}
                    onChange={(e) => setLinkProvider(e.target.value as JanitorCloudProvider)}
                  >
                    <option value="do">DigitalOcean</option>
                    <option value="aws">AWS</option>
                    <option value="gcp">Google Cloud</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-fg-muted">
                  Display name
                  <input
                    className="mt-1 w-full rounded-md border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Production DO"
                    required
                  />
                </label>
                <label className="text-xs font-medium text-fg-muted">
                  {linkProvider === "do" ? "API token" : "Read credential (JSON or token)"}
                  <input
                    className="mt-1 w-full rounded-md border border-border-default bg-bg-panel px-3 py-2 font-mono text-sm text-fg-primary outline-none ring-accent-blue focus:ring-1"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={
                      linkProvider === "do"
                        ? "dop_v1_…"
                        : linkProvider === "aws"
                          ? "{ \"accessKeyId\": \"…\", \"secretAccessKey\": \"…\" }"
                          : "{ \"type\": \"service_account\", … }"
                    }
                    type="password"
                    autoComplete="off"
                    required
                  />
                </label>
                <label className="text-xs font-medium text-fg-muted">
                  Scan schedule
                  <select
                    className="mt-1 w-full rounded-md border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary"
                    value={scanSchedule}
                    onChange={(e) =>
                      setScanSchedule(e.target.value as "manual" | "daily" | "weekly")
                    }
                  >
                    <option value="manual">Manual</option>
                    <option
                      value="daily"
                      disabled={entitlements ? !entitlements.scheduledScansAllowed : true}
                    >
                      Daily (plan)
                    </option>
                    <option
                      value="weekly"
                      disabled={entitlements ? !entitlements.scheduledScansAllowed : true}
                    >
                      Weekly (plan)
                    </option>
                  </select>
                </label>
                {entitlements && entitlements.linkedAccountsMax >= 0 ? (
                  <p className="text-xs text-fg-faint">
                    Plan limit: {entitlements.linkedAccountsMax} linked account
                    {entitlements.linkedAccountsMax === 1 ? "" : "s"}.
                  </p>
                ) : null}
                <Button type="submit" disabled={busy !== null}>
                  {busy === "add" ? "Saving…" : "Save account"}
                </Button>
              </form>
            </Card>
          ) : null}

          <Card
            title="Linked accounts"
            action={
              <button
                type="button"
                onClick={() => void loadAll()}
                className="text-xs font-medium text-accent-blue hover:underline"
              >
                Refresh
              </button>
            }
          >
            <div className="overflow-hidden rounded-lg border border-border-subtle">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-bg-panel-elevated text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                  <tr>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Schedule</th>
                    <th className="px-4 py-3">Last scan</th>
                    <th className="px-4 py-3" title="Added · removed · score changed vs previous scan">
                      Last Δ
                    </th>
                    {canManage ? <th className="px-4 py-3 text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle bg-bg-panel">
                  {loading ? (
                    <tr>
                      <td className="px-4 py-6 text-fg-muted" colSpan={canManage ? 6 : 5}>
                        Loading…
                      </td>
                    </tr>
                  ) : accounts.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-fg-muted" colSpan={canManage ? 6 : 5}>
                        No accounts linked yet.
                      </td>
                    </tr>
                  ) : (
                    accounts.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-3 font-medium text-fg-primary">{a.accountName}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge tone="accent">
                              {janitorProviderLabel(a.provider as JanitorCloudProvider)}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-fg-muted">{a.scanSchedule}</td>
                        <td className="px-4 py-3 text-fg-muted">
                          <div className="flex flex-col gap-1">
                            <span>{a.lastScanAt ? new Date(a.lastScanAt).toLocaleString() : "—"}</span>
                            {a.lastScanStatus === "failed" && (a.lastScanError?.length ?? 0) > 0 ? (
                              <span
                                className="max-w-xs text-[11px] text-amber-600 dark:text-amber-400"
                                title={a.lastScanError ?? ""}
                              >
                                Scan failed — showing last successful findings. Hover for detail.
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 font-mono text-xs text-fg-muted"
                          title={charonDiffTooltip(a.lastScanDiff)}
                        >
                          {formatCharonDiffSummary(a.lastScanDiff)}
                        </td>
                        {canManage ? (
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="secondary"
                              disabled={busy !== null}
                              onClick={() => void runScan(a.id)}
                              className="h-8 px-3 text-xs"
                            >
                              {busy === a.id ? "Scanning…" : "Run scan"}
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "findings" ? (
        <div className="space-y-4">
          <Card
            title="Filters"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" className="h-8 text-xs" onClick={() => void exportCsv()} disabled={findings.length === 0}>
                  Export CSV
                </Button>
              </div>
            }
          >
            <div className="flex flex-wrap gap-3">
              <select
                className="rounded-md border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary"
                value={filterAccountId}
                onChange={(e) => {
                  setFilterAccountId(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountName}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary"
                value={filterResourceType}
                onChange={(e) => {
                  setFilterResourceType(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                <option value="">All types</option>
                <option value="droplet">Droplet</option>
                <option value="volume">Volume</option>
                <option value="snapshot">Snapshot</option>
                <option value="ec2_instance">EC2 instance</option>
                <option value="ebs_volume">EBS volume</option>
                <option value="ebs_snapshot">EBS snapshot</option>
                <option value="gce_disk">GCE disk</option>
                <option value="gce_snapshot">GCE snapshot</option>
              </select>
            </div>
          </Card>

          {canManage && entitlements?.cleanupQueue ? (
            <Card title="Request cleanup">
              <p className="mb-3 text-sm text-fg-muted">
                Select findings below, choose dry-run or live (Growth+), then create requests for the
                cleanup queue. Live requests skip resources tagged as protected (built-in markers like{" "}
                <span className="font-mono text-fg-primary">production</span> /{" "}
                <span className="font-mono text-fg-primary">blackglass-protected</span> plus your policy
                protector tags); approval is also blocked server-side before any cloud delete.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="rounded-md border border-border-default bg-bg-panel px-3 py-2 text-sm"
                  value={cleanupMode}
                  onChange={(e) => setCleanupMode(e.target.value as "dry_run" | "live")}
                >
                  <option value="dry_run">Dry-run</option>
                  <option value="live" disabled={!entitlements.liveCleanup}>
                    Live (Growth+)
                  </option>
                </select>
                <Button
                  disabled={busy !== null || selectedFindings.size === 0}
                  onClick={() => void requestCleanup()}
                >
                  {busy === "cleanup" ? "Submitting…" : `Request cleanup (${selectedFindings.size})`}
                </Button>
              </div>
            </Card>
          ) : null}

          <Card title="Findings">
            <div className="overflow-hidden rounded-lg border border-border-subtle">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-bg-panel-elevated text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                  <tr>
                    {canManage && entitlements?.cleanupQueue ? (
                      <th className="w-10 px-3 py-3" aria-label="Select" />
                    ) : null}
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Idle</th>
                    <th className="px-4 py-3">Est. waste / mo</th>
                    <th className="px-4 py-3">Detected</th>
                    <th className="px-4 py-3">Console</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle bg-bg-panel">
                  {loading ? (
                    <tr>
                      <td
                        className="px-4 py-6 text-fg-muted"
                        colSpan={canManage && entitlements?.cleanupQueue ? 7 : 6}
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : findings.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-6 text-fg-muted"
                        colSpan={canManage && entitlements?.cleanupQueue ? 7 : 6}
                      >
                        No findings yet. Run a scan from the Accounts tab.
                      </td>
                    </tr>
                  ) : (
                    findings.map((f) => {
                      const b = idleBadge(f.idleScore);
                      const consoleUrl =
                        f.provider &&
                        janitorFindingConsoleUrl({
                          provider: f.provider,
                          resourceType: f.resourceType,
                          resourceId: f.resourceId,
                          metricsMeta: f.metricsMeta ?? null,
                        });
                      return (
                        <tr key={f.id}>
                          {canManage && entitlements?.cleanupQueue ? (
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selectedFindings.has(f.id)}
                                onChange={() => toggleFinding(f.id)}
                                className="h-4 w-4 rounded border-border-default"
                              />
                            </td>
                          ) : null}
                          <td className="px-4 py-3">
                            <div className="font-medium text-fg-primary">{f.resourceName}</div>
                            <div className="font-mono text-[11px] text-fg-faint">{f.resourceId}</div>
                            {canManage ? (
                              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                                <button
                                  type="button"
                                  className="text-fg-muted hover:text-accent-blue hover:underline disabled:opacity-40"
                                  disabled={busy !== null}
                                  onClick={() => void suppressFinding(f.id, "dismiss")}
                                >
                                  Dismiss
                                </button>
                                <button
                                  type="button"
                                  className="text-fg-muted hover:text-accent-blue hover:underline disabled:opacity-40"
                                  disabled={busy !== null}
                                  onClick={() => void suppressFinding(f.id, "snooze", 7)}
                                >
                                  Snooze 7d
                                </button>
                                <button
                                  type="button"
                                  className="text-fg-muted hover:text-accent-blue hover:underline disabled:opacity-40"
                                  disabled={busy !== null}
                                  onClick={() => void suppressFinding(f.id, "snooze", 30)}
                                >
                                  Snooze 30d
                                </button>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone="neutral">{f.resourceType}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={b.tone}>{b.label}</Badge>
                            <span className="ml-2 text-fg-muted">{f.idleScore}</span>
                          </td>
                          <td className="px-4 py-3 text-fg-muted">${f.estimatedWasteMonthly}</td>
                          <td className="px-4 py-3 text-xs text-fg-faint">
                            {new Date(f.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {consoleUrl ? (
                              <a
                                href={consoleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-accent-blue hover:underline"
                              >
                                Open
                              </a>
                            ) : (
                              <span className="text-fg-faint">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {pagination.totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between text-sm text-fg-muted">
                <span>
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="h-8 px-3 text-xs"
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-8 px-3 text-xs"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "cleanup" ? (
        <Card
          title="Cleanup queue"
          action={
            <button
              type="button"
              onClick={() => void loadCleanup()}
              className="text-xs font-medium text-accent-blue hover:underline"
            >
              Refresh
            </button>
          }
        >
          {!entitlements?.cleanupQueue ? (
            <p className="text-sm text-fg-muted">
              Cleanup queue is available on Starter and higher. Lab workspaces can still scan and
              view findings.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border-subtle">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-bg-panel-elevated text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                  <tr>
                    <th className="px-4 py-3">Resource</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Updated</th>
                    {canManage ? <th className="px-4 py-3 text-right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle bg-bg-panel">
                  {cleanupRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-fg-muted" colSpan={canManage ? 5 : 4}>
                        No cleanup requests yet.
                      </td>
                    </tr>
                  ) : (
                    cleanupRows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.resourceName}</div>
                          <div className="text-xs text-fg-faint">
                            {r.resourceType} · {r.resourceId}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={r.mode === "live" ? "danger" : "neutral"}>{r.mode}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge
                              tone={
                                r.status === "executed"
                                  ? "success"
                                  : r.status === "rejected"
                                    ? "warning"
                                    : r.status === "failed"
                                      ? "danger"
                                      : "accent"
                              }
                            >
                              {r.status}
                            </Badge>
                            {r.status === "failed" &&
                            typeof r.metadata?.executionError === "string" &&
                            r.metadata.executionError.length > 0 ? (
                              <span
                                className="max-w-xs text-[11px] text-danger"
                                title={r.metadata.executionError}
                              >
                                {r.metadata.executionError.length > 120
                                  ? `${r.metadata.executionError.slice(0, 120)}…`
                                  : r.metadata.executionError}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-fg-faint">
                          {r.executedAt
                            ? new Date(r.executedAt).toLocaleString()
                            : r.createdAt
                              ? new Date(r.createdAt).toLocaleString()
                              : "—"}
                        </td>
                        {canManage ? (
                          <td className="px-4 py-3 text-right">
                            {r.status === "pending" ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  className="h-8 px-2 text-xs"
                                  disabled={busy === r.id}
                                  onClick={() => void approveRequest(r.id, "reject")}
                                >
                                  Reject
                                </Button>
                                <Button
                                  className="h-8 px-2 text-xs"
                                  disabled={busy === r.id}
                                  onClick={() => void approveRequest(r.id, "approve")}
                                >
                                  Approve
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-fg-faint">—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "suppressions" ? (
        <Card
          title="Dismissed & snoozed resources"
          action={
            <button
              type="button"
              onClick={() => void loadSuppressions()}
              className="text-xs font-medium text-accent-blue hover:underline"
            >
              Refresh
            </button>
          }
        >
          <p className="mb-4 text-sm text-fg-muted">
            Suppressions hide matching resources from full rescans. Remove a row to allow the
            resource to show up again after the next scan. Snoozed entries expire on the date shown.
          </p>
          <div className="overflow-hidden rounded-lg border border-border-subtle">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-bg-panel-elevated text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Until</th>
                  <th className="px-4 py-3">Created</th>
                  {canManage ? <th className="px-4 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-bg-panel">
                {suppressionRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-fg-muted" colSpan={canManage ? 6 : 5}>
                      No active suppressions.
                    </td>
                  </tr>
                ) : (
                  suppressionRows.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 text-fg-muted">{accountLabel(s.accountId)}</td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] text-fg-faint">{s.resourceType}</div>
                        <div className="font-medium text-fg-primary">{s.resourceId}</div>
                        {s.note ? (
                          <div className="mt-0.5 text-xs text-fg-muted">{s.note}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={s.kind === "dismiss" ? "neutral" : "warning"}>{s.kind}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-muted">
                        {s.kind === "snooze" && s.snoozeUntil
                          ? new Date(s.snoozeUntil).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-faint">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="secondary"
                            className="h-8 px-2 text-xs"
                            disabled={busy !== null}
                            onClick={() => void removeSuppression(s.id)}
                          >
                            Remove
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
