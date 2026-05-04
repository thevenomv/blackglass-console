"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  getMemberInviteContextAction,
  inviteMemberAction,
} from "@/app/(app)/settings/members/actions";
import { Button } from "@/components/ui/Button";

export function InviteMemberModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [roles, setRoles] = useState<{ value: string; label: string; paidSeat: boolean }[]>([]);
  const [seatSummary, setSeatSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refreshContext = useCallback(() => {
    startTransition(async () => {
      const ctx = await getMemberInviteContextAction();
      if (!ctx.ok) {
        setError(ctx.message);
        return;
      }
      setRoles(ctx.roles);
      setRole((prev) =>
        ctx.roles.some((r) => r.value === prev) ? prev : (ctx.roles[0]?.value ?? "viewer"),
      );
      const u = ctx.seatUsage;
      setSeatSummary(
        `${u.paidSeatsUsed} / ${u.paidSeatLimit < 0 ? "∞" : u.paidSeatLimit} paid seats used — viewers unlimited`,
      );
    });
  }, []);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-card border border-border-default bg-bg-panel p-6 shadow-elevated">
        <h2 className="text-lg font-semibold text-fg-primary">Invite member</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Paid seats apply to owner, admin, and operator. Viewers and guest auditors never consume
          seats.
        </p>
        {seatSummary && (
          <p className="mt-3 rounded-card border border-border-subtle bg-bg-elevated px-3 py-2 font-mono text-xs text-fg-muted">
            {seatSummary}
          </p>
        )}
        <label className="mt-4 block text-xs text-fg-faint">
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="mt-1 w-full rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm"
            placeholder="colleague@company.com"
            autoComplete="off"
          />
        </label>
        <label className="mt-3 block text-xs text-fg-faint">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
                {r.paidSeat ? " (paid seat)" : ""}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await inviteMemberAction(email, role);
                if (!res.ok) {
                  setError(res.message);
                  return;
                }
                onClose();
              });
            }}
          >
            Send invite
          </Button>
        </div>
      </div>
    </div>
  );
}
