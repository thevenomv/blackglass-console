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
        <div>
          <h2 className="text-sm font-semibold text-fg-primary">Collector hosts</h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            Add each server you want BLACKGLASS to monitor. BLACKGLASS connects over SSH — the
            same secure protocol system administrators use to log into servers remotely. To make
            that work you need two things: the server&apos;s IP address (add it below) and an SSH
            key pair used as the login credential.
          </p>
          <div className="mt-2 space-y-2 rounded-card border border-border-subtle bg-bg-elevated p-3 text-xs text-fg-muted">
            <p className="font-medium text-fg-primary text-sm">How to get an SSH key</p>
            <p>
              <span className="font-medium text-fg-primary">Non-technical / managed setup:</span>{" "}
              Email{" "}
              <a href="mailto:jamie@obsidiandynamics.co.uk?subject=SSH%20key%20setup%20for%20BLACKGLASS" className="text-accent-blue hover:underline">jamie@obsidiandynamics.co.uk</a>{" "}
              with your server&apos;s IP address. We will generate a key pair, send you the
              public half to add to your server, and configure the private half in your
              BLACKGLASS deployment — you never have to handle a raw key file.
            </p>
            <p>
              <span className="font-medium text-fg-primary">Technical / self-serve:</span>{" "}
              Run <span className="font-mono bg-bg-base px-1 rounded">ssh-keygen -t ed25519 -C "blackglass-collector" -f blackglass_key -N ""</span> on
              any machine. This creates two files: <span className="font-mono">blackglass_key.pub</span> (the
              public key — copy its contents onto your server into{" "}
              <span className="font-mono">~blackglass/.ssh/authorized_keys</span>) and{" "}
              <span className="font-mono">blackglass_key</span> (the private key — send this to{" "}
              <a href="mailto:jamie@obsidiandynamics.co.uk?subject=SSH%20private%20key%20for%20BLACKGLASS" className="text-accent-blue hover:underline">jamie@obsidiandynamics.co.uk</a>{" "}
              to be added to your deployment, or set it as the{" "}
              <span className="font-mono">SSH_PRIVATE_KEY</span> environment variable if you self-host).
            </p>
          </div>
        </div>
        {!addingHost && (
          <Button variant="secondary" type="button" onClick={() => setAddingHost(true)}>
            + Add host
          </Button>
        )}
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
