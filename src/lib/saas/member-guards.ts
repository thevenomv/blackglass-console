import type { TenantRole } from "@/lib/saas/tenant-role";

/** True when demoting or removing the only active owner would leave the workspace without an owner. */
export function soleOwnerDemotionBlocked(
  memberships: { userId: string; role: TenantRole; status: string }[],
  targetUserId: string,
  newRole: TenantRole,
): boolean {
  const target = memberships.find((m) => m.userId === targetUserId);
  if (!target || target.role !== "owner" || newRole === "owner") return false;
  const owners = memberships.filter((m) => m.role === "owner" && m.status === "active");
  return owners.length <= 1;
}
