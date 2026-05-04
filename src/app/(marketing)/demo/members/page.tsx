import { DEMO_MEMBERS } from "@/lib/demo/seed";
import { DemoGateButton } from "@/components/demo/DemoGateButton";

export default function DemoMembersPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-primary">Members</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Read-only directory — invites require a real workspace.
          </p>
        </div>
        <DemoGateButton actionLabel="Invite member">Invite member</DemoGateButton>
      </div>
      <div className="overflow-x-auto rounded-card border border-border-default">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs uppercase tracking-wider text-fg-faint">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Seat</th>
              <th className="px-3 py-2">MFA</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_MEMBERS.map((m) => (
              <tr key={m.id} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 text-fg-primary">{m.name}</td>
                <td className="px-3 py-2 text-fg-muted">{m.email}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.role}</td>
                <td className="px-3 py-2">
                  {m.paidSeat ? (
                    <span className="text-accent-blue">Paid seat</span>
                  ) : (
                    <span className="text-fg-faint">No charge</span>
                  )}
                </td>
                <td className="px-3 py-2">{m.mfa ? "On" : "Off"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
