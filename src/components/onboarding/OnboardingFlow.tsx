"use client";

import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useState } from "react";

const STEPS = [
  "Welcome",
  "What BLACKGLASS does",
  "Connect host",
  "Scan permissions",
  "Pin baseline",
  "First snapshot",
] as const;

export function OnboardingFlow() {
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-10 px-6 pb-16 pt-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">First run</p>
        <h1 className="mt-2 text-xl font-semibold text-fg-primary">Establish operational trust</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Walk through collector install, permissions, and your first baseline-aligned snapshot.
        </p>
      </div>

      <ol className="flex flex-wrap gap-3 border-b border-border-subtle pb-5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-7 min-w-[28px] items-center justify-center rounded-full text-xs font-semibold ${
                i === step
                  ? "bg-accent-blue text-white"
                  : i < step
                    ? "bg-success-soft text-success"
                    : "border border-border-default text-fg-faint"
              }`}
            >
              {i + 1}
            </span>
            <span className={`text-xs sm:text-sm ${i === step ? "text-fg-primary" : "text-fg-muted"}`}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
          <h2 className="text-sm font-semibold text-fg-primary">Welcome to BLACKGLASS</h2>
          <p className="text-sm leading-relaxed text-fg-muted">
            BLACKGLASS compares live Linux state to approved baselines — highlighting drift that
            commonly precedes incidents: listeners, privileged users, persistence, SSH posture,
            firewall regressions, and package/kernel drift.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-fg-muted">
            <li>Answers what changed, whether it is risky, and what evidence you can export.</li>
            <li>Designed for production operators — calm visuals, high signal, no decorative noise.</li>
          </ul>
          <Button type="button" onClick={next}>
            Continue
          </Button>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
          <h2 className="text-sm font-semibold text-fg-primary">What you unlock</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Fleet drift radar with severity-aware grouping",
              "Host investigations with actionable timelines",
              "Evidence bundles tuned for audit + IR workflows",
              "Baseline comparisons that stay readable under pressure",
            ].map((item) => (
              <div
                key={item}
                className="rounded-md border border-border-subtle bg-bg-base/50 px-3 py-2 text-sm text-fg-muted"
              >
                {item}
              </div>
            ))}
          </div>
          <Button type="button" onClick={next}>
            Next
          </Button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
          <h2 className="text-sm font-semibold text-fg-primary">Connect your first host</h2>
          <p className="text-sm text-fg-muted">
            Install the collector on a representative production workload — outbound HTTPS only,
            read-only introspection on-host.
          </p>
          <label className="block text-xs text-fg-faint">
            Host label
            <input
              defaultValue="prod-edge-01"
              className="mt-1 w-full rounded-card border border-border-default bg-bg-base px-3 py-2 font-mono text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
            />
          </label>
          <pre className="overflow-x-auto rounded-card border border-border-default bg-bg-base p-4 font-mono text-[12px] text-fg-muted">
            curl -fsSL https://install.blackglass.invalid/run.sh | sudo bash -s -- --token YOUR_API_KEY
          </pre>
          <p className="text-xs text-fg-faint">Waiting for collector heartbeat…</p>
          <Button type="button" onClick={next}>
            Heartbeat received
          </Button>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
          <h2 className="text-sm font-semibold text-fg-primary">Confirm scan permissions</h2>
          <p className="text-sm text-fg-muted">
            Scans enumerate listeners, accounts, systemd units, SSH configuration, firewall rules,
            and installed packages without modifying system state.
          </p>
          <ul className="space-y-2 text-sm text-fg-muted">
            <label className="flex items-start gap-2">
              <input type="checkbox" defaultChecked className="mt-1 accent-[var(--accent-blue)]" />I
              authorize read-only integrity snapshots on this host.
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" defaultChecked className="mt-1 accent-[var(--accent-blue)]" />I
              understand privileged deltas require human review before closure.
            </label>
          </ul>
          <Button type="button" onClick={next}>
            Permissions acknowledged
          </Button>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
          <h2 className="text-sm font-semibold text-fg-primary">Pin a baseline</h2>
          <p className="text-sm text-fg-muted">
            Capture the approved state after change freeze — future scans diff against this anchor.
          </p>
          <label className="block text-xs text-fg-faint">
            Baseline label
            <input
              defaultValue="prod-bootstrap-2026-05-01"
              className="mt-1 w-full rounded-card border border-border-default bg-bg-base px-3 py-2 font-mono text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" className="accent-[var(--accent-blue)]" />
            Apply tag <span className="font-mono text-fg-primary">pci-scope</span>
          </label>
          <Button type="button" onClick={next}>
            Save baseline
          </Button>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
          <h2 className="text-sm font-semibold text-fg-primary">First integrity snapshot</h2>
          <p className="text-sm text-fg-muted">
            Baseline captured — BLACKGLASS will flag drift against this snapshot on every re-scan.
          </p>
          <div className="rounded-card border border-success/40 bg-success-soft/30 px-4 py-3 text-sm text-fg-muted">
            Snapshot signed at <span className="font-mono text-fg-primary">2026-05-01T09:41:02Z</span>{" "}
            · checksum <span className="font-mono text-xs text-fg-faint">sha256:5f2cb…</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/">
              <Button type="button">Open fleet dashboard</Button>
            </Link>
            <Link href="/hosts/host-07">
              <Button variant="secondary" type="button">
                Inspect seeded host
              </Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
