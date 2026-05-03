import type { TenantRole } from "./tenant-role";
import { isPaidSeatRole } from "./tenant-role";

export type SeatUsage = {
  paidSeatsUsed: number;
  paidSeatLimit: number;
  unlimitedViewers: true;
};

export function countPaidSeats(memberships: { role: TenantRole; status: string }[]): number {
  return memberships.filter((m) => m.status === "active" && isPaidSeatRole(m.role)).length;
}

/**
 * Returns whether assigning `targetRole` is allowed under seat cap.
 * Viewers and guest_auditor never consume seats — always allowed.
 */
export function canAddPaidSeat(
  memberships: { role: TenantRole; status: string }[],
  paidSeatLimit: number,
  targetRole: TenantRole,
): { ok: true } | { ok: false; reason: "seat_cap_exceeded" } {
  if (!isPaidSeatRole(targetRole)) return { ok: true };
  if (paidSeatLimit < 0) return { ok: true };
  const used = countPaidSeats(memberships);
  if (paidSeatLimit >= 0 && used >= paidSeatLimit) {
    return { ok: false, reason: "seat_cap_exceeded" };
  }
  return { ok: true };
}

/**
 * Seat impact of changing one member's role (paid↔paid keeps one seat; free→paid may need capacity).
 */
export function canApplyRoleChange(
  memberships: { userId: string; role: TenantRole; status: string }[],
  targetUserId: string,
  newRole: TenantRole,
  paidSeatLimit: number,
): { ok: true } | { ok: false; reason: "seat_cap_exceeded" } {
  const current = memberships.find((m) => m.userId === targetUserId);
  const oldRole = current?.role ?? "viewer";
  const oldPaid = !!current && current.status === "active" && isPaidSeatRole(oldRole);
  const newPaid = isPaidSeatRole(newRole);
  if (!newPaid) return { ok: true };
  if (oldPaid) return { ok: true };
  const others = memberships.filter((m) => m.userId !== targetUserId);
  return canAddPaidSeat(others, paidSeatLimit, newRole);
}

export function getSeatUsage(
  memberships: { role: TenantRole; status: string }[],
  paidSeatLimit: number,
): SeatUsage {
  return {
    paidSeatsUsed: countPaidSeats(memberships),
    paidSeatLimit,
    unlimitedViewers: true,
  };
}
