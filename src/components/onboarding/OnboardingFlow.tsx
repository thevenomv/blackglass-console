"use client";

import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useEffect, useState } from "react";

const STEPS = [
  "Welcome",
  "What BLACKGLASS does",
  "Connect host",
  "Scan permissions",
  "Pin baseline",
  "First snapshot",
] as const;

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;

function ConnectHostStep({ onNext }: { onNext: () => void }) {
  const [status, setStatus] = useState<"waiting" | "detected" | "timeout">("waiting");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    let stopped = false;

    const poll = async () => {
      const now = Date.now();
      const elapsedMs = now - start;
      setElapsed(Math.floor(elapsedMs / 1000));

      if (elapsedMs >= POLL_TIMEOUT_MS) {
        setStatus("timeout");
        return;
      }

      try {
        const res = await fetch("/api/v1/fleet/snapshot");
        if (res.ok) {
          const data = (await res.json()) as { collectorsOnline?: number };
          if ((data.collectorsOnline ?? 0) > 0) {
            setStatus("detected");
            return;
          }
        }
      } catch {
        // network error — keep polling
      }

      if (!stopped) {
        window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    if (status === "detected") {
      const t = window.setTimeout(onNext, 1200);
      return () => window.clearTimeout(t);
    }
  }, [status, onNext]);

  return (
    <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
      <h2 className="text-sm font-semibold text-fg-primary">Connect your first host</h2>
      <p className="text-sm text-fg-muted">
        BLACKGLASS uses SSH-based collection — no agent install required on the target host.
        Ask your operator to configure the collector credentials, then this step will advance
        automatically once a heartbeat is detected.
      </p>
      <div className="space-y-3 rounded-card border border-border-subtle bg-bg-elevated p-4 text-sm">
        <p className="font-medium text-fg-primary">Operator setup (one-time per host)</p>
        <ol className="list-decimal space-y-2 pl-5 text-fg-muted">
          <li>
            Create a <span className="font-mono text-fg-primary">blackglass</span> user on the target host
            and configure <code className="rounded bg-bg-base px-1 text-xs">sudoers</code> for the read-only
            command set your security team approves — your Blackglass administrator supplies the exact
            checklist.
          </li>
          <li>
            Your administrator sets <code className="rounded bg-bg-base px-1 text-xs">COLLECTOR_HOST_N</code>,{" "}
            <code className="rounded bg-bg-base px-1 text-xs">COLLECTOR_USER</code>, and SSH credentials in the
            deployment environment (or via your secrets manager).
          </li>
          <li>
            Once the platform can reach the host over SSH, this step completes automatically.
          </li>
        </ol>
      </div>
      {status === "waiting" && (
        <div className="flex items-center gap-2 text-xs text-fg-faint">
          <svg
            className="h-3.5 w-3.5 animate-spin text-accent-blue"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Polling for collector heartbeat… ({elapsed}s)
        </div>
      )}
      {status === "detected" && (
        <p className="text-xs text-success">Heartbeat detected — advancing…</p>
      )}
      {status === "timeout" && (
        <p className="text-xs text-warning">
          No heartbeat detected after {POLL_TIMEOUT_MS / 1000}s. Check collector install, then skip or retry.
        </p>
      )}
      <div className="flex gap-2">
        {status !== "detected" ? (
          <Button type="button" onClick={onNext}>
            {status === "timeout" ? "Skip for now" : "Continue anyway"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

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

      {step === 2 && <ConnectHostStep onNext={next} />}

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
            <Link href="/dashboard">
              <Button type="button">Open fleet dashboard</Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
