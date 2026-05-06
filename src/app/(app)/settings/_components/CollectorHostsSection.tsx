"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
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
  const [newHostname, setNewHostname] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newUser, setNewUser] = useState("blackglass");
  const [newPort, setNewPort] = useState("22");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

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

  const handleDelete = async (id: string, hostname: string) => {
    if (!window.confirm(`Remove ${hostname} from your collector fleet?`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/v1/collector/hosts/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(String(res.status));
      toastRef.current(`${hostname} removed.`, "success");
      setHosts((h) => h.filter((x) => x.id !== id));
    } catch {
      toastRef.current("Could not remove host.", "danger");
    } finally {
      setDeleting(null);
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

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-primary">Collector hosts</h2>
        {!addingHost && (
          <Button variant="secondary" type="button" onClick={() => setAddingHost(true)} className="shrink-0 whitespace-nowrap">
            + Add host
          </Button>
        )}
      </div>
      <div>
        <p className="text-sm text-fg-muted">
          Add each server you want BLACKGLASS to monitor via SSH. You&apos;ll need the
          server&apos;s IP address and an SSH key pair as the login credential.
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
        <ul className="divide-y divide-border-default rounded-card border border-border-default">
          {hosts.map((host) => (
            <li key={host.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
              <div className="flex shrink-0 items-center gap-2">
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
                >
                  {deleting === host.id ? "Removing…" : "Remove"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
