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
  | "evidence.view";

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
  ],
  viewer: ["reports.view", "dashboards.view", "alerts.view"],
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
