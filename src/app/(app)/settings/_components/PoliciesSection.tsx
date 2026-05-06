"use client";

/**
 * PoliciesSection — settings card for managing "must stay true" drift policies.
 *
 * CRUD for saas_host_policies via /api/v1/policies.
 * A policy fires a finding when the live snapshot violates the condition.
 */

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useEffect, useState } from "react";

const DRIFT_CATEGORIES = [
  "ssh", "network_exposure", "firewall", "packages",
  "integrity", "identity", "privilege_escalation", "persistence",
] as const;

interface PolicyRule {
  id: string;
  name: string;
  category: typeof DRIFT_CATEGORIES[number];
  conditionKey: string;
  conditionValue: string;
  severity: "high" | "medium" | "low";
  enabled: boolean;
  createdAt: string;
}

const SEVERITY_TONE = {
  high: "danger",
  medium: "warning",
  low: "neutral",
} as const;

/** Common pre-built policy templates for quick setup. */
const TEMPLATES: Omit<PolicyRule, "id" | "createdAt">[] = [
  { name: "SSH PermitRootLogin disabled", category: "ssh", conditionKey: "sshConfig.permitRootLogin", conditionValue: "no", severity: "high", enabled: true },
  { name: "SSH PasswordAuthentication disabled", category: "ssh", conditionKey: "sshConfig.passwordAuthentication", conditionValue: "no", severity: "high", enabled: true },
  { name: "Firewall active", category: "firewall", conditionKey: "firewallStatus.active", conditionValue: "true", severity: "high", enabled: true },
];

export function PoliciesSection() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "ssh" as typeof DRIFT_CATEGORIES[number],
    conditionKey: "",
    conditionValue: "",
    severity: "high" as PolicyRule["severity"],
  });
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/v1/policies")
      .then((r) => r.json())
      .then((d: { policies?: PolicyRule[] }) => setPolicies(d.policies ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async (override?: Partial<typeof form>) => {
    const data = { ...form, ...override };
    setCreating(true);
    try {
      const res = await fetch("/api/v1/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast("Policy created.", "success");
      setShowForm(false);
      setForm({ name: "", category: "ssh", conditionKey: "", conditionValue: "", severity: "high" });
      load();
    } catch {
      toast("Failed to create policy.", "danger");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/v1/policies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      toast("Policy deleted.", "success");
      load();
    } catch {
      toast("Failed to delete policy.", "danger");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="h-8 animate-pulse rounded-card bg-bg-elevated" />
      ) : policies.length === 0 ? (
        <p className="text-sm text-fg-muted">No policies configured. Add one or use a template.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-card border border-border-default">
          {policies.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg-primary">{p.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-fg-faint">
                  {p.conditionKey} == {p.conditionValue}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={SEVERITY_TONE[p.severity]}>{p.severity}</Badge>
                <button
                  type="button"
                  disabled={deleting === p.id}
                  onClick={() => void remove(p.id)}
                  className="rounded px-2 py-1 text-xs text-fg-faint transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                  aria-label={`Delete policy ${p.name}`}
                >
                  {deleting === p.id ? "…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Quick templates */}
      {!showForm && (
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.filter((t) => !policies.some((p) => p.name === t.name)).map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => void create(t)}
              className="rounded-card border border-border-default px-2 py-1 text-xs text-fg-muted transition-colors hover:border-accent-blue hover:text-accent-blue"
            >
              + {t.name}
            </button>
          ))}
          <Button variant="secondary" type="button" onClick={() => setShowForm(true)}>
            + Custom rule
          </Button>
        </div>
      )}

      {showForm && (
        <form
          className="space-y-3 rounded-card border border-border-default bg-bg-panel p-4"
          onSubmit={(e) => { e.preventDefault(); void create(); }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              required
              type="text"
              placeholder="Rule name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as typeof form.category }))}
              className="rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
            >
              {DRIFT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              required
              type="text"
              placeholder="Condition key (e.g. sshConfig.permitRootLogin)"
              value={form.conditionKey}
              onChange={(e) => setForm((f) => ({ ...f, conditionKey: e.target.value }))}
              className="rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
            />
            <input
              required
              type="text"
              placeholder="Expected value (e.g. no)"
              value={form.conditionValue}
              onChange={(e) => setForm((f) => ({ ...f, conditionValue: e.target.value }))}
              className="rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
            />
            <select
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as PolicyRule["severity"] }))}
              className="rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
            >
              <option value="high">High severity</option>
              <option value="medium">Medium severity</option>
              <option value="low">Low severity</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create policy"}
            </Button>
            <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
