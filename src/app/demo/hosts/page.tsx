import { DEMO_HOSTS } from "@/lib/demo/seed";
import { DemoGateButton } from "@/components/demo/DemoGateButton";

export default function DemoHostsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-fg-primary">Hosts</h1>
        <DemoGateButton actionLabel="Add host">Add host</DemoGateButton>
      </div>
      <div className="overflow-x-auto rounded-card border border-border-default">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs uppercase tracking-wider text-fg-faint">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Env</th>
              <th className="px-3 py-2">Region</th>
              <th className="px-3 py-2">OS</th>
              <th className="px-3 py-2">Kernel</th>
              <th className="px-3 py-2">SSH posture</th>
              <th className="px-3 py-2">Risk</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_HOSTS.map((h) => (
              <tr key={h.id} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 font-medium text-fg-primary">{h.name}</td>
                <td className="px-3 py-2 text-fg-muted">{h.env}</td>
                <td className="px-3 py-2 font-mono text-xs text-fg-muted">{h.region}</td>
                <td className="px-3 py-2 text-fg-muted">{h.os}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-fg-faint">{h.kernel}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      h.sshHardening === "pass"
                        ? "text-emerald-400"
                        : h.sshHardening === "warn"
                          ? "text-amber-400"
                          : "text-red-400"
                    }
                  >
                    {h.sshHardening}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums text-fg-muted">{h.riskScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
