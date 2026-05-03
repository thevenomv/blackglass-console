"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { TenantRole } from "@/lib/saas/tenant-role";
import { isPaidSeatRole } from "@/lib/saas/tenant-role";
import { InviteMemberModal } from "@/components/saas/InviteMemberModal";
import { Button } from "@/components/ui/Button";
import { updateMemberRoleAction } from "./actions";

type Row = {
  userId: string;
  role: TenantRole;
  status: string;
  joinedAt: string;
  mfaEnabled: boolean | null;
  displayName: string | null;
  primaryEmail: string | null;
};

const ROLE_LABEL: Record<TenantRole, string> = {
  owner: "Owner",
  admin: "Admin",
  operator: "Operator",
  viewer: "Viewer",
  guest_auditor: "Guest auditor",
};

export function MembersView({
  rows,
  canInvite,
  canReassignRoles,
  assignableRoles,
  currentUserId,
}: {
  rows: Row[];
  canInvite: boolean;
  canReassignRoles: boolean;
  assignableRoles: TenantRole[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = rows.filter((r) => {
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return (
      r.userId.toLowerCase().includes(s) ||
      (r.displayName?.toLowerCase().includes(s) ?? false) ||
      (r.primaryEmail?.toLowerCase().includes(s) ?? false)
    );
  });

  return (
    <>
      {open ? <InviteMemberModal onClose={() => setOpen(false)} /> : null}
      {error ? (
        <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {error}
        </p>
      ) : null}
      <section className="rounded-card border border-border-default bg-bg-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg-primary">Directory</h2>
          {canInvite ? (
            <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
              Invite member
            </Button>
          ) : null}
        </div>
        <p className="mb-3 text-xs text-fg-faint">
          MFA status is read from Clerk (Admin API). App roles are enforced from Postgres — never
          from the client.
        </p>
        <div className="mb-3">
          <label htmlFor="member-search" className="sr-only">
            Filter members
          </label>
          <input
            id="member-search"
            type="search"
            placeholder="Filter by name, email, or user id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full max-w-md rounded border border-border-subtle bg-bg-base px-3 py-2 text-sm text-fg-primary"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-xs uppercase tracking-wider text-fg-faint">
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Adjust</th>
                <th className="py-2 pr-4">Seat</th>
                <th className="py-2 pr-4">MFA</th>
                <th className="py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.userId} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 pr-4 text-xs text-fg-muted">
                    <div className="text-fg-primary">{r.displayName ?? "—"}</div>
                    {r.primaryEmail ? (
                      <div className="text-[11px] text-fg-muted">{r.primaryEmail}</div>
                    ) : null}
                    <div className="font-mono text-[10px] text-fg-faint">
                      {r.userId}
                      {r.userId === currentUserId ? (
                        <span className="ml-1 text-fg-faint">(you)</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-fg-primary">{r.role}</td>
                  <td className="py-2 pr-4">
                    {canReassignRoles ? (
                      <span className="inline-flex flex-col gap-1">
                        <label className="sr-only" htmlFor={`role-${r.userId}`}>
                          Role for {r.userId}
                        </label>
                        <select
                        id={`role-${r.userId}`}
                        className="max-w-[11rem] rounded border border-border-subtle bg-bg-base px-2 py-1 text-xs text-fg-primary"
                        value={r.role}
                        disabled={pending}
                        onChange={(e) => {
                          const next = e.target.value as TenantRole;
                          setError(null);
                          startTransition(() => {
                            void (async () => {
                              const res = await updateMemberRoleAction(r.userId, next);
                              if (!res.ok) {
                                setError(res.message);
                              }
                              router.refresh();
                            })();
                          });
                        }}
                      >
                        {Array.from(new Set<TenantRole>([...assignableRoles, r.role])).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                      </span>
                    ) : (
                      <span className="text-xs text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {isPaidSeatRole(r.role) ? (
                      <span className="rounded border border-accent-blue/40 px-2 py-0.5 text-xs text-accent-blue">
                        Paid seat
                      </span>
                    ) : (
                      <span className="text-xs text-fg-faint">No charge</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs text-fg-muted">
                    {r.mfaEnabled === true ? (
                      <span className="text-emerald-400">On</span>
                    ) : r.mfaEnabled === false ? (
                      <span className="text-amber-300">Off</span>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-fg-faint">{r.joinedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
