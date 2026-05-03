export const TENANT_ROLES = [
  "owner",
  "admin",
  "operator",
  "viewer",
  "guest_auditor",
] as const;

export type TenantRole = (typeof TENANT_ROLES)[number];

export function isTenantRole(s: string): s is TenantRole {
  return (TENANT_ROLES as readonly string[]).includes(s);
}

/** Roles that consume paid seats on commercial plans (not viewers / guest auditors). */
export function isPaidSeatRole(role: TenantRole): boolean {
  return role === "owner" || role === "admin" || role === "operator";
}
