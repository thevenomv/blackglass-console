import type { TenantRole } from "./tenant-role";

/** Fine-grained permissions enforced server-side only. */
export type SaasPermission =
  | "billing.manage"
  | "members.manage"
  | "members.invite_non_owner"
  | "roles.assign_all"
  | "roles.assign_non_owner"
  | "secrets.manage"
  | "hosts.manage"
  | "hosts.manage_limited"
  | "scans.run"
  | "baselines.manage"
  | "drift.manage"
  | "reports.view"
  | "dashboards.view"
  | "alerts.view"
  | "evidence.view"
  /** Manage long-lived programmatic API keys (mint/list/revoke). Owner + admin. */
  | "apikeys.manage"
  /** Manage host-policy invariants (mint/list/disable). Owner + admin. */
  | "policies.manage"
  /** Manage tenant integration settings (webhooks, alert routing, schedule). Owner + admin. */
  | "settings.write"
  /** Charon: link cloud accounts and enqueue scans. */
  | "janitor.manage"
  /** Charon: view accounts and findings. */
  | "janitor.read";

const matrix: Record<TenantRole, readonly SaasPermission[]> = {
  owner: [
    "billing.manage",
    "members.manage",
    "members.invite_non_owner",
    "roles.assign_all",
    "secrets.manage",
    "hosts.manage",
    "scans.run",
    "baselines.manage",
    "drift.manage",
    "reports.view",
    "dashboards.view",
    "alerts.view",
    "evidence.view",
    "apikeys.manage",
    "policies.manage",
    "settings.write",
    "janitor.manage",
    "janitor.read",
  ],
  admin: [
    "members.invite_non_owner",
    "roles.assign_non_owner",
    "secrets.manage",
    "hosts.manage",
    "scans.run",
    "baselines.manage",
    "drift.manage",
    "reports.view",
    "dashboards.view",
    "alerts.view",
    "evidence.view",
    "apikeys.manage",
    "policies.manage",
    "settings.write",
    "janitor.manage",
    "janitor.read",
  ],
  operator: [
    "secrets.manage",
    "scans.run",
    "hosts.manage_limited",
    "drift.manage",
    "reports.view",
    "dashboards.view",
    "alerts.view",
    "evidence.view",
    "janitor.manage",
    "janitor.read",
  ],
  viewer: ["reports.view", "dashboards.view", "alerts.view", "janitor.read"],
  guest_auditor: ["reports.view", "evidence.view"],
};

export function hasPermission(role: TenantRole, permission: SaasPermission): boolean {
  return matrix[role].includes(permission);
}

/**
 * Whether `actor` may assign `targetRole` without silent downgrades elsewhere.
 * Enforcement is on create/update only; existing rows are untouched by this helper.
 */
export function canAssignRole(actorRole: TenantRole, targetRole: TenantRole): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") {
    return targetRole !== "owner";
  }
  return false;
}
