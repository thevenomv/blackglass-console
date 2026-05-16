"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type CollectorHost = {
  id: string;
  hostname: string;
  label: string | null;
  sshUser: string;
  sshPort: number;
  enabled: boolean;
};

export function CollectorHostsSection() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });

  const [hosts, setHosts] = useState<CollectorHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingHost, setAddingHost] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<
    | null
    | {
        summary: { total: number; added: number; duplicates: number; invalid: number };
        results: { hostname: string; status: "added" | "duplicate" | "invalid"; error?: string }[];
      }
  >(null);
  const [newHostname, setNewHostname] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newUser, setNewUser] = useState("blackglass");
  const [newPort, setNewPort] = useState("22");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkActionRunning, setBulkActionRunning] = useState<
    null | "enable" | "disable" | "remove"
  >(null);
  const [testResult, setTestResult] = useState<
    | null
    | {
        hostId: string;
        ok: boolean;
        summary: string;
        durationMs: number;
        mode: "ssh-pull" | "agent-push" | "agent-push-and-ssh" | "down";
        stages: {
          tcp: { ok: boolean; durationMs: number; error?: string };
          ssh: { ok: boolean; durationMs: number; error?: string };
          exec: { ok: boolean; durationMs: number; error?: string; stdout?: string; stderr?: string };
          agent: {
            ok: boolean;
            hostId: string;
            lastSeenAt: string | null;
            ageSeconds: number | null;
            fresh: boolean;
          };
        };
      }
  >(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/collector/hosts");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { hosts: CollectorHost[] };
      setHosts(data.hosts ?? []);
    } catch {
      toastRef.current("Could not load collector hosts.", "danger");
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/collector/hosts");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { hosts: CollectorHost[] };
        if (!cancelled) setHosts(data.hosts ?? []);
      } catch {
        if (!cancelled) toastRef.current("Could not load collector hosts.", "danger");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const hostname = newHostname.trim();
    if (!hostname) { toastRef.current("Enter a hostname or IP address.", "warning"); return; }
    const portNum = Number(newPort);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      toastRef.current("SSH port must be between 1 and 65535.", "warning"); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/collector/hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname,
          label: newLabel.trim() || undefined,
          sshUser: newUser.trim() || "blackglass",
          sshPort: portNum,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        toastRef.current(body.detail ?? "Could not add host.", "danger");
        return;
      }
      toastRef.current(`${hostname} added.`, "success");
      setNewHostname(""); setNewLabel(""); setNewUser("blackglass"); setNewPort("22");
      setAddingHost(false);
      await reload();
    } catch {
      toastRef.current("Could not add host.", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // "Stop scanning" — unschedules SSH pulls but PRESERVES baseline + drift
  // history. The new Hosts → Delete host action is the right call when the
  // operator wants the host gone from inventory entirely (and the agent
  // tombstoned for 24h to prevent immediate resurrection). We changed the
  // label from "Remove" → "Stop scanning" + added the inline note above
  // because the legacy label was a footgun: operators expected full delete.
  // ---------------------------------------------------------------------------
  const handleDelete = async (id: string, hostname: string) => {
    if (
      !window.confirm(
        `Stop scanning ${hostname}?\n\n` +
          `This unschedules SSH-pull scans against this host but PRESERVES ` +
          `its captured baseline and drift history. Use Hosts → Delete host ` +
          `if you want to forget the host completely.`,
      )
    )
      return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/v1/collector/hosts/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(String(res.status));
      toastRef.current(`Stopped scanning ${hostname}.`, "success");
      setHosts((h) => h.filter((x) => x.id !== id));
    } catch {
      toastRef.current("Could not stop scanning host.", "danger");
    } finally {
      setDeleting(null);
    }
  };

  /**
   * Parse a CSV / newline-separated paste into the bulk-import payload.
   *
   * Accepts either:
   *   - one hostname per line:                   `host1.example.com`
   *   - csv with optional fields (any order via header row):
   *     `hostname,label,sshUser,sshPort`
   *     `host1.example.com,prod-web-01,blackglass,22`
   *
   * Lines starting with `#` are comments. Blank lines ignored.
   */
  const parseBulkText = (
    raw: string,
  ): {
    rows: { hostname: string; label?: string; sshUser?: string; sshPort?: number }[];
    parseErrors: { line: number; raw: string; error: string }[];
  } => {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    const rows: { hostname: string; label?: string; sshUser?: string; sshPort?: number }[] = [];
    const parseErrors: { line: number; raw: string; error: string }[] = [];

    if (lines.length === 0) return { rows, parseErrors };

    // Detect a header row: any line that contains "hostname" as a token.
    let header: string[] | null = null;
    let dataStart = 0;
    const firstParts = lines[0]!.split(/[,\t]/).map((s) => s.trim().toLowerCase());
    if (firstParts.includes("hostname")) {
      header = firstParts;
      dataStart = 1;
    }

    for (let i = dataStart; i < lines.length; i++) {
      const line = lines[i]!;
      const parts = line.split(/[,\t]/).map((s) => s.trim());
      const lineNo = i + 1;

      if (header) {
        const obj: Record<string, string> = {};
        header.forEach((h, idx) => {
          const val = parts[idx];
          if (val !== undefined && val !== "") obj[h] = val;
        });
        const hostname = obj["hostname"];
        if (!hostname) {
          parseErrors.push({ line: lineNo, raw: line, error: "missing hostname column" });
          continue;
        }
        const sshPortRaw = obj["sshport"] ?? obj["port"];
        const sshPort = sshPortRaw ? parseInt(sshPortRaw, 10) : undefined;
        if (sshPortRaw && (!Number.isInteger(sshPort) || (sshPort ?? 0) < 1 || (sshPort ?? 0) > 65535)) {
          parseErrors.push({ line: lineNo, raw: line, error: `invalid port "${sshPortRaw}"` });
          continue;
        }
        const sshUser = obj["sshuser"] ?? obj["user"];
        rows.push({
          hostname,
          ...(obj["label"] ? { label: obj["label"] } : {}),
          ...(sshUser ? { sshUser } : {}),
          ...(sshPort !== undefined ? { sshPort } : {}),
        });
      } else {
        // Single-column or positional CSV: hostname[,label[,sshUser[,sshPort]]]
        const [hostname, label, sshUser, sshPortRaw] = parts;
        if (!hostname) continue;
        const sshPort = sshPortRaw ? parseInt(sshPortRaw, 10) : undefined;
        if (sshPortRaw && (!Number.isInteger(sshPort) || (sshPort ?? 0) < 1 || (sshPort ?? 0) > 65535)) {
          parseErrors.push({ line: lineNo, raw: line, error: `invalid port "${sshPortRaw}"` });
          continue;
        }
        rows.push({
          hostname,
          ...(label ? { label } : {}),
          ...(sshUser ? { sshUser } : {}),
          ...(sshPort !== undefined ? { sshPort } : {}),
        });
      }
    }

    return { rows, parseErrors };
  };

  const handleBulkImport = async () => {
    setBulkResult(null);
    const { rows, parseErrors } = parseBulkText(bulkText);
    if (parseErrors.length > 0) {
      const first = parseErrors[0]!;
      toastRef.current(`Line ${first.line}: ${first.error}`, "warning");
      return;
    }
    if (rows.length === 0) {
      toastRef.current("Nothing to import — paste at least one hostname.", "warning");
      return;
    }

    setBulkSubmitting(true);
    try {
      const res = await fetch("/api/v1/collector/hosts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hosts: rows }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        summary?: { total: number; added: number; duplicates: number; invalid: number };
        results?: { hostname: string; status: "added" | "duplicate" | "invalid"; error?: string }[];
        detail?: string;
        message?: string;
      };
      if (!res.ok) {
        toastRef.current(body.detail ?? body.message ?? "Bulk import failed.", "danger");
        return;
      }
      const summary = body.summary ?? { total: rows.length, added: 0, duplicates: 0, invalid: 0 };
      const results = body.results ?? [];
      setBulkResult({ summary, results });
      toastRef.current(
        `${summary.added} added, ${summary.duplicates} duplicate, ${summary.invalid} invalid.`,
        summary.added > 0 ? "success" : "warning",
      );
      if (summary.added > 0) await reload();
    } catch {
      toastRef.current("Bulk import failed — network error.", "danger");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleTest = async (host: CollectorHost) => {
    setTesting(host.id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/v1/collector/hosts/${host.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string; message?: string };
        toastRef.current(body.detail ?? body.message ?? "Test failed.", "danger");
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        summary: string;
        durationMs: number;
        mode: "ssh-pull" | "agent-push" | "agent-push-and-ssh" | "down";
        stages: {
          tcp: { ok: boolean; durationMs: number; error?: string };
          ssh: { ok: boolean; durationMs: number; error?: string };
          exec: { ok: boolean; durationMs: number; error?: string; stdout?: string; stderr?: string };
          agent: {
            ok: boolean;
            hostId: string;
            lastSeenAt: string | null;
            ageSeconds: number | null;
            fresh: boolean;
          };
        };
      };
      setTestResult({
        hostId: host.id,
        ok: data.ok,
        summary: data.summary,
        durationMs: data.durationMs,
        mode: data.mode,
        stages: data.stages,
      });
      toastRef.current(data.summary, data.ok ? "success" : "warning");
    } catch {
      toastRef.current("Test failed — network error.", "danger");
    } finally {
      setTesting(null);
    }
  };

  const handleToggle = async (host: CollectorHost) => {
    setToggling(host.id);
    try {
      const res = await fetch(`/api/v1/collector/hosts/${host.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !host.enabled }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setHosts((prev) =>
        prev.map((h) => (h.id === host.id ? { ...h, enabled: !host.enabled } : h)),
      );
    } catch {
      toastRef.current("Could not update host.", "danger");
    } finally {
      setToggling(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Bulk selection + actions — fan out the existing per-row endpoints with
  // Promise.allSettled so partial failures don't block the rest of the batch.
  // The endpoints are idempotent (PATCH + DELETE) so retries are safe.
  // ---------------------------------------------------------------------------
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      // If everyone is already selected, treat as deselect-all to give the
      // header checkbox a clean tri-state toggle.
      if (hosts.length > 0 && prev.size === hosts.length) return new Set();
      return new Set(hosts.map((h) => h.id));
    });
  }, [hosts]);

  const runBulk = async (action: "enable" | "disable" | "remove") => {
    // Use the effective set so we don't try to PATCH/DELETE ids that vanished
    // between selection and click (e.g. another tab removed the host).
    const ids = Array.from(effectiveSelectedIds);
    if (ids.length === 0) return;
    if (
      action === "remove" &&
      !window.confirm(
        `Stop scanning ${ids.length} host${ids.length === 1 ? "" : "s"}?\n\n` +
          `This unschedules SSH-pull scans for the selected hosts but ` +
          `PRESERVES their captured baseline and drift history. Use ` +
          `Hosts → Delete host to forget hosts entirely.`,
      )
    ) {
      return;
    }

    setBulkActionRunning(action);
    const settled = await Promise.allSettled(
      ids.map((id) =>
        action === "remove"
          ? fetch(`/api/v1/collector/hosts/${id}`, { method: "DELETE" }).then((res) => {
              if (!res.ok && res.status !== 204) {
                throw new Error(`DELETE ${id} → ${res.status}`);
              }
              return id;
            })
          : fetch(`/api/v1/collector/hosts/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled: action === "enable" }),
            }).then((res) => {
              if (!res.ok) throw new Error(`PATCH ${id} → ${res.status}`);
              return id;
            }),
      ),
    );

    const ok = settled.filter((r) => r.status === "fulfilled").length;
    const failed = settled.length - ok;
    setBulkActionRunning(null);

    if (action === "remove") {
      const removedIds = new Set(
        settled
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
          .map((r) => r.value),
      );
      setHosts((prev) => prev.filter((h) => !removedIds.has(h.id)));
      setSelectedIds(new Set());
      // Note: legacy `action === "remove"` value name is preserved to avoid
      // a churn rename across the bulk-action branch; the user-facing copy
      // below now uses "stopped scanning" for accuracy.
    } else {
      const enabledNext = action === "enable";
      const updatedIds = new Set(
        settled
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
          .map((r) => r.value),
      );
      setHosts((prev) =>
        prev.map((h) => (updatedIds.has(h.id) ? { ...h, enabled: enabledNext } : h)),
      );
    }

    const verb =
      action === "remove" ? "stopped scanning" : action === "enable" ? "enabled" : "disabled";
    if (failed === 0) {
      toastRef.current(
        `${ok} host${ok === 1 ? "" : "s"} ${verb}.`,
        "success",
      );
    } else if (ok === 0) {
      toastRef.current(`Bulk ${verb} failed for all ${failed} hosts.`, "danger");
    } else {
      toastRef.current(
        `${ok} ${verb}, ${failed} failed. Affected hosts kept selected for retry.`,
        "warning",
      );
      // Keep failed ids in the selection so the operator can retry without
      // re-selecting from scratch.
      const failedIds = new Set(
        settled
          .map((r, i) => (r.status === "rejected" ? ids[i] : null))
          .filter((id): id is string => id !== null),
      );
      setSelectedIds(failedIds);
    }
  };

  // Derive the *effective* selection at render time — `selectedIds` may carry
  // ids for hosts that were just removed (the worker confirmation is async).
  // This keeps `selectedIds` itself authoritative for user clicks while the
  // counters/CTAs see only currently-rendered ids. Memoization is left to the
  // React Compiler so the early-return-on-empty optimization doesn't break it.
  const validHostIds = new Set(hosts.map((h) => h.id));
  const effectiveSelectedIds = new Set<string>();
  for (const id of selectedIds) if (validHostIds.has(id)) effectiveSelectedIds.add(id);

  const allSelected = hosts.length > 0 && effectiveSelectedIds.size === hosts.length;
  const someSelected =
    effectiveSelectedIds.size > 0 && effectiveSelectedIds.size < hosts.length;

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-primary">Collector hosts</h2>
        {!addingHost && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setBulkOpen(true);
                setBulkResult(null);
              }}
              className="whitespace-nowrap"
              title="Paste a CSV or one hostname per line — useful when migrating from another inventory tool."
            >
              Bulk import
            </Button>
            <Button variant="secondary" type="button" onClick={() => setAddingHost(true)} className="whitespace-nowrap">
              + Add host
            </Button>
          </div>
        )}
      </div>
      <div>
        <p className="text-sm text-fg-muted">
          Add each server you want Blackglass to monitor via SSH. You&apos;ll need the
          server&apos;s IP address and an SSH key pair as the login credential.
        </p>
        <p className="mt-1.5 text-xs text-fg-faint">
          <span className="font-medium text-fg-muted">Note:</span> &quot;Stop scanning&quot;
          here only unschedules SSH-pull scans — captured baseline and drift history
          are kept. To forget a host completely (and tombstone it for{" "}
          <span className="font-mono">HOST_TOMBSTONE_TTL_HOURS</span> so a still-running
          push-agent can&apos;t resurrect it), use{" "}
          <Link href="/hosts" className="font-medium text-accent-blue hover:underline">
            Hosts → Delete host
          </Link>
          .
        </p>
        <details className="mt-2 rounded-card border border-border-subtle bg-bg-elevated text-xs text-fg-muted">
          <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-fg-primary">
            Get started — SSH key setup
          </summary>
          <div className="space-y-3 border-t border-border-subtle px-3 py-3">
            <div>
              <p className="font-medium text-fg-primary">1. Generate a key pair</p>
              <p className="mt-1">Run this on any machine (Linux, macOS, or WSL):</p>
              <code className="mt-1.5 block rounded bg-bg-base px-2.5 py-2 font-mono text-[11px] leading-relaxed text-fg-primary">
                ssh-keygen -t ed25519 -C &quot;blackglass-collector&quot; -f blackglass_key -N &quot;&quot;
              </code>
              <p className="mt-1.5">
                This creates two files: <span className="font-mono">blackglass_key</span> (private) and{" "}
                <span className="font-mono">blackglass_key.pub</span> (public).
              </p>
            </div>
            <div>
              <p className="font-medium text-fg-primary">2. Add the public key to your server</p>
              <p className="mt-1">
                Log in to your server and append the public key to the collector user&apos;s
                authorised keys:
              </p>
              <code className="mt-1.5 block rounded bg-bg-base px-2.5 py-2 font-mono text-[11px] leading-relaxed text-fg-primary">
                cat blackglass_key.pub | ssh root@YOUR_SERVER{" "}
                &quot;mkdir -p ~blackglass/.ssh &amp;&amp; cat &gt;&gt; ~blackglass/.ssh/authorized_keys &amp;&amp; chmod 600 ~blackglass/.ssh/authorized_keys&quot;
              </code>
              <p className="mt-1.5">
                Replace <span className="font-mono">root@YOUR_SERVER</span> with your server&apos;s address.
              </p>
            </div>
            <div>
              <p className="font-medium text-fg-primary">3. Add the private key to Settings</p>
              <p className="mt-1">
                Paste the contents of <span className="font-mono">blackglass_key</span> into the{" "}
                <strong className="font-medium text-fg-primary">SSH private key</strong> field in the
                Collector credentials section below, then add your host above.
              </p>
            </div>
          </div>
        </details>
      </div>

      {addingHost && (
        <form onSubmit={handleAdd} className="space-y-3 rounded-card border border-border-default bg-bg-base p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-fg-muted" htmlFor="ch-hostname">
                Hostname / IP <span aria-hidden>*</span>
              </label>
              <input
                id="ch-hostname"
                type="text"
                required
                placeholder="192.168.1.10 or host.example.com"
                value={newHostname}
                onChange={(e) => setNewHostname(e.target.value)}
                className="w-full rounded-card border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-fg-muted" htmlFor="ch-label">
                Label <span className="font-normal">(optional)</span>
              </label>
              <input
                id="ch-label"
                type="text"
                placeholder="prod-web-01"
                maxLength={120}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full rounded-card border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-fg-muted" htmlFor="ch-user">
                SSH user
              </label>
              <input
                id="ch-user"
                type="text"
                placeholder="blackglass"
                maxLength={64}
                value={newUser}
                onChange={(e) => setNewUser(e.target.value)}
                className="w-full rounded-card border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-fg-muted" htmlFor="ch-port">
                SSH port
              </label>
              <input
                id="ch-port"
                type="number"
                min={1}
                max={65535}
                value={newPort}
                onChange={(e) => setNewPort(e.target.value)}
                className="w-full rounded-card border border-border-default bg-bg-panel px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Adding…" : "Add host"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setAddingHost(false); setNewHostname(""); setNewLabel(""); setNewUser("blackglass"); setNewPort("22"); }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : hosts.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No hosts registered yet. Add a host to include it in collector scans.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-card border border-border-default bg-bg-elevated px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                aria-label="Select all hosts"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={selectAllVisible}
                className="h-3.5 w-3.5 cursor-pointer accent-accent-blue"
              />
              {effectiveSelectedIds.size === 0 ? (
                <span>Select hosts to enable bulk actions</span>
              ) : (
                <span>
                  <span className="font-semibold text-fg-primary">
                    {effectiveSelectedIds.size}
                  </span>{" "}
                  of {hosts.length} selected
                </span>
              )}
            </label>
            {effectiveSelectedIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs"
                  disabled={bulkActionRunning !== null}
                  onClick={() => void runBulk("enable")}
                  title="Mark selected hosts as enabled — they will be included in the next scan."
                >
                  {bulkActionRunning === "enable"
                    ? "Enabling…"
                    : `Enable (${effectiveSelectedIds.size})`}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs"
                  disabled={bulkActionRunning !== null}
                  onClick={() => void runBulk("disable")}
                  title="Mark selected hosts as disabled — collectors will skip them on the next scan."
                >
                  {bulkActionRunning === "disable"
                    ? "Disabling…"
                    : `Disable (${effectiveSelectedIds.size})`}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="text-xs"
                  disabled={bulkActionRunning !== null}
                  onClick={() => void runBulk("remove")}
                  title="Unschedule SSH-pull scans for the selected hosts. Baseline and drift history are preserved — use Hosts → Delete host for the full forget cascade."
                >
                  {bulkActionRunning === "remove"
                    ? "Stopping…"
                    : `Stop scanning (${effectiveSelectedIds.size})`}
                </Button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={bulkActionRunning !== null}
                  className="rounded-md border border-border-default px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg-primary disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          <ul className="divide-y divide-border-default rounded-card border border-border-default">
            {hosts.map((host) => (
              <li
                key={host.id}
                className={`flex flex-col gap-2 px-4 py-3 transition-colors ${
                  effectiveSelectedIds.has(host.id) ? "bg-accent-blue-soft/30" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${host.hostname}`}
                      checked={effectiveSelectedIds.has(host.id)}
                      onChange={() => toggleSelected(host.id)}
                      disabled={bulkActionRunning !== null}
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-accent-blue"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-fg-primary">
                        {host.hostname}
                        <span className="ml-2 font-sans text-xs text-fg-muted">
                          :{host.sshPort} · {host.sshUser}
                        </span>
                      </p>
                      {host.label && (
                        <p className="truncate text-xs text-fg-muted">{host.label}</p>
                      )}
                    </div>
                  </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={testing === host.id}
                    onClick={() => void handleTest(host)}
                    className="text-xs"
                    title="Run TCP probe + SSH handshake + whoami; useful for diagnosing failed scans."
                  >
                    {testing === host.id ? "Testing…" : "Test SSH"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleToggle(host)}
                    disabled={toggling === host.id}
                    aria-label={host.enabled ? "Disable host" : "Enable host"}
                    className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-1 disabled:opacity-50 ${
                      host.enabled ? "bg-accent-blue" : "bg-border-default"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        host.enabled ? "translate-x-4" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <Button
                    variant="danger"
                    type="button"
                    disabled={deleting === host.id}
                    onClick={() => handleDelete(host.id, host.hostname)}
                    className="text-xs"
                    title="Unschedule SSH-pull scans for this host. Baseline and drift history are preserved — use Hosts → Delete host for the full forget cascade."
                  >
                    {deleting === host.id ? "Stopping…" : "Stop scanning"}
                  </Button>
                </div>
              </div>

              {testResult?.hostId === host.id ? (
                <div
                  className={`rounded-card border px-3 py-2 text-xs ${
                    testResult.ok
                      ? "border-success/40 bg-success-soft/25 text-fg-muted"
                      : "border-danger/40 bg-danger-soft/25 text-fg-muted"
                  }`}
                >
                  <p className={`font-semibold ${testResult.ok ? "text-success" : "text-danger"}`}>
                    {testResult.summary}{" "}
                    <span className="ml-1 font-normal text-fg-faint">
                      ({testResult.durationMs}ms)
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] text-fg-faint">
                    mode: <span className="font-mono text-fg-muted">{testResult.mode}</span>
                  </p>
                  <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-fg-faint">
                    <li>
                      TCP {testResult.stages.tcp.ok ? "✓" : "✗"} {testResult.stages.tcp.durationMs}ms
                      {testResult.stages.tcp.error ? ` — ${testResult.stages.tcp.error}` : ""}
                    </li>
                    <li>
                      SSH {testResult.stages.ssh.ok ? "✓" : "✗"} {testResult.stages.ssh.durationMs}ms
                      {testResult.stages.ssh.error ? ` — ${testResult.stages.ssh.error}` : ""}
                    </li>
                    <li>
                      exec {testResult.stages.exec.ok ? "✓" : "✗"} {testResult.stages.exec.durationMs}ms
                      {testResult.stages.exec.error ? ` — ${testResult.stages.exec.error}` : ""}
                    </li>
                    <li>
                      agent {testResult.stages.agent.fresh ? "✓" : "✗"}
                      {testResult.stages.agent.lastSeenAt
                        ? ` — last ingest ${testResult.stages.agent.ageSeconds}s ago (hostId=${testResult.stages.agent.hostId})`
                        : ` — no baseline snapshot for hostId=${testResult.stages.agent.hostId}`}
                    </li>
                  </ul>
                  {testResult.stages.exec.stdout ? (
                    <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-bg-base px-2 py-1.5 font-mono text-[11px] text-fg-primary">
                      {testResult.stages.exec.stdout}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
          </ul>
        </>
      )}

      {bulkOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bulk import hosts"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => {
            if (!bulkSubmitting) setBulkOpen(false);
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-border-default bg-bg-panel shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-fg-primary">Bulk import hosts</h3>
                <p className="mt-0.5 text-xs text-fg-muted">
                  Paste a CSV (with header) or one hostname per line. Up to 200 hosts per batch.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                disabled={bulkSubmitting}
                className="shrink-0 rounded-md border border-border-default px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg-primary disabled:opacity-50"
              >
                Close
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <details className="mb-3 rounded-card border border-border-subtle bg-bg-elevated text-xs text-fg-muted">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-fg-primary">
                  Format reference
                </summary>
                <div className="space-y-2 border-t border-border-subtle px-3 py-2.5">
                  <p className="font-medium text-fg-primary">One hostname per line</p>
                  <pre className="overflow-x-auto rounded bg-bg-base px-2 py-1.5 font-mono text-[11px] text-fg-primary">
{`web-01.example.com
web-02.example.com
192.168.1.10`}
                  </pre>
                  <p className="font-medium text-fg-primary">CSV with header (any subset of columns)</p>
                  <pre className="overflow-x-auto rounded bg-bg-base px-2 py-1.5 font-mono text-[11px] text-fg-primary">
{`hostname,label,sshUser,sshPort
web-01.example.com,prod-web,blackglass,22
db-01.example.com,prod-db,blackglass,2222`}
                  </pre>
                  <p className="text-fg-faint">
                    Tabs are also accepted as column separators. Lines starting with{" "}
                    <span className="font-mono">#</span> are ignored.
                  </p>
                </div>
              </details>

              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                disabled={bulkSubmitting}
                spellCheck={false}
                rows={10}
                placeholder={`web-01.example.com\nweb-02.example.com`}
                className="w-full resize-y rounded-card border border-border-default bg-bg-base px-3 py-2 font-mono text-xs text-fg-primary outline-none ring-accent-blue focus:ring-2"
              />

              {bulkResult ? (
                <div className="mt-3 space-y-2">
                  <div
                    className={`rounded-card border px-3 py-2 text-xs ${
                      bulkResult.summary.added > 0
                        ? "border-success/40 bg-success-soft/25"
                        : "border-warning/40 bg-warning-soft/25"
                    }`}
                  >
                    <p className="font-semibold text-fg-primary">
                      {bulkResult.summary.added} added · {bulkResult.summary.duplicates} duplicate ·{" "}
                      {bulkResult.summary.invalid} invalid · {bulkResult.summary.total} total
                    </p>
                  </div>
                  {bulkResult.results.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto rounded-card border border-border-subtle">
                      <ul className="divide-y divide-border-subtle text-xs">
                        {bulkResult.results.slice(0, 100).map((r) => (
                          <li
                            key={r.hostname}
                            className="flex items-center justify-between gap-2 px-3 py-1.5"
                          >
                            <span className="truncate font-mono text-fg-primary">{r.hostname}</span>
                            <span
                              className={
                                r.status === "added"
                                  ? "text-success"
                                  : r.status === "duplicate"
                                    ? "text-warning"
                                    : "text-danger"
                              }
                            >
                              {r.status}
                              {r.error ? ` — ${r.error}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setBulkOpen(false)}
                disabled={bulkSubmitting}
              >
                Close
              </Button>
              <Button type="button" onClick={() => void handleBulkImport()} disabled={bulkSubmitting || !bulkText.trim()}>
                {bulkSubmitting ? "Importing…" : "Import hosts"}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
