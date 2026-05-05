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
const SOFT_READY_AFTER_MS = 25_000;

function ConnectHostStep({ onNext }: { onNext: () => void }) {
  const [status, setStatus] = useState<"waiting" | "detected" | "timeout">("waiting");
  const [elapsed, setElapsed] = useState(0);
  const [method, setMethod] = useState<"push" | "ssh">("push");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

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
          const data = (await res.json()) as {
            hostsChecked?: number;
            coverage?: { collectorsOnline?: number; collectorsExpected?: number };
          };
          const online = data.coverage?.collectorsOnline ?? 0;
          const expected = data.coverage?.collectorsExpected ?? 0;
          const checked = data.hostsChecked ?? 0;
          if (online > 0 || checked > 0 || (expected > 0 && elapsedMs >= SOFT_READY_AFTER_MS)) {
            setStatus("detected");
            return;
          }
        }
      } catch {
        // keep polling
      }

      if (!stopped) window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    if (status === "detected") {
      const t = window.setTimeout(onNext, 1200);
      return () => window.clearTimeout(t);
    }
  }, [status, onNext]);

  const generateKey = async () => {
    setGeneratingKey(true);
    try {
      const res = await fetch("/api/v1/collector/keys/rotate", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { api_key?: string };
      if (body.api_key) setApiKey(body.api_key);
    } catch {
      // ignore
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyKey = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setKeyCopied(true);
    window.setTimeout(() => setKeyCopied(false), 2000);
  };

  return (
    <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
      <h2 className="text-sm font-semibold text-fg-primary">Connect your first host</h2>
      <p className="text-sm text-fg-muted">
        Choose how BLACKGLASS collects data from your server. Both methods give you the same
        drift detection and evidence exports.
      </p>

      {/* Method toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMethod("push")}
          className={`flex-1 rounded-card border px-3 py-2.5 text-sm font-medium transition-colors ${
            method === "push"
              ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
              : "border-border-default text-fg-muted hover:border-border-strong hover:text-fg-primary"
          }`}
        >
          Push agent <span className="ml-1 rounded bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success">Recommended</span>
        </button>
        <button
          type="button"
          onClick={() => setMethod("ssh")}
          className={`flex-1 rounded-card border px-3 py-2.5 text-sm font-medium transition-colors ${
            method === "ssh"
              ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
              : "border-border-default text-fg-muted hover:border-border-strong hover:text-fg-primary"
          }`}
        >
          SSH pull
        </button>
      </div>

      {method === "push" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-bg-elevated p-4 text-sm space-y-3">
            <p className="font-medium text-fg-primary">How it works</p>
            <p className="text-fg-muted">
              A lightweight script runs on your server and sends a read-only snapshot to BLACKGLASS
              over HTTPS. No inbound firewall rules needed — your server calls us, not the other way round.
            </p>
            <ol className="list-decimal space-y-3 pl-5 text-fg-muted">
              <li>
                <strong className="font-medium text-fg-primary">Generate an API key</strong> — click
                the button below. Copy it somewhere safe; it is shown once.
              </li>
              <li>
                <strong className="font-medium text-fg-primary">Run one command on your server</strong>{" "}
                (as root or with sudo):
                <pre className="mt-2 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-xs text-fg-primary">
{`curl -fsSL https://blackglasssec.com/install-agent.sh | \\\n  BLACKGLASS_KEY=<your-key> bash`}
                </pre>
                <p className="mt-1 text-xs text-fg-faint">
                  The script creates a read-only <span className="font-mono">blackglass</span> user,
                  installs the agent, and starts it as a systemd service. One minute to run.
                </p>
              </li>
              <li>
                <strong className="font-medium text-fg-primary">Done.</strong> The agent sends its
                first snapshot immediately. You will see your host appear in the fleet dashboard.
              </li>
            </ol>
          </div>

          {/* Key generation */}
          {!apiKey ? (
            <Button type="button" onClick={() => void generateKey()} disabled={generatingKey}>
              {generatingKey ? "Generating…" : "Generate API key"}
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-fg-muted">Your API key — copy it now, it won&apos;t be shown again:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-xs text-fg-primary">
                  {apiKey}
                </code>
                <Button type="button" variant="secondary" onClick={() => void copyKey()}>
                  {keyCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-fg-faint">
                Paste it into the install command above, replacing <span className="font-mono">&lt;your-key&gt;</span>.
              </p>
            </div>
          )}

          <p className="text-xs text-fg-faint">
            Prefer SSH pull instead?{" "}
            <button type="button" onClick={() => setMethod("ssh")} className="text-accent-blue hover:underline">
              Switch to SSH setup
            </button>
            , or email{" "}
            <a href="mailto:jamie@obsidiandynamics.co.uk" className="text-accent-blue hover:underline">
              jamie@obsidiandynamics.co.uk
            </a>{" "}
            and we will handle it for you.
          </p>
        </div>
      )}

      {method === "ssh" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-bg-elevated p-4 text-sm space-y-3">
            <p className="font-medium text-fg-primary">SSH pull setup</p>
            <p className="text-fg-muted">
              BLACKGLASS SSHs into your server using a dedicated read-only account. Good for
              environments where installing an agent is not permitted.
            </p>
            <p className="text-fg-muted">
              This requires an SSH key pair to be configured in your BLACKGLASS deployment.{" "}
              <strong className="font-medium text-fg-primary">
                Email{" "}
                <a href="mailto:jamie@obsidiandynamics.co.uk?subject=SSH%20key%20setup%20for%20BLACKGLASS" className="text-accent-blue hover:underline">
                  jamie@obsidiandynamics.co.uk
                </a>
              </strong>{" "}
              with your server&apos;s IP address — we will generate the key pair, send you the public
              half to add to your server, and configure the private half in your deployment. Usually
              done within one business day.
            </p>
            <div className="rounded bg-bg-base px-3 py-2 text-xs text-fg-faint space-y-1">
              <p className="font-medium text-fg-muted">Self-hosted / technical setup</p>
              <p>
                Run{" "}
                <span className="font-mono">ssh-keygen -t ed25519 -C "blackglass-collector" -f blackglass_key -N ""</span>.
                Add <span className="font-mono">blackglass_key.pub</span> to your server&apos;s{" "}
                <span className="font-mono">~blackglass/.ssh/authorized_keys</span>, then set{" "}
                <span className="font-mono">SSH_PRIVATE_KEY</span> (contents of{" "}
                <span className="font-mono">blackglass_key</span>) and{" "}
                <span className="font-mono">COLLECTOR_HOST_1</span> (server IP) as environment
                variables in your BLACKGLASS deployment.
              </p>
            </div>
          </div>
          <p className="text-xs text-fg-faint">
            Prefer the agent instead?{" "}
            <button type="button" onClick={() => setMethod("push")} className="text-accent-blue hover:underline">
              Switch to push agent
            </button>
            {" "}— no emails needed, self-serve in under a minute.
          </p>
        </div>
      )}

      {/* Fleet activity feedback */}
      {status === "waiting" && (
        <div className="flex items-center gap-2 text-xs text-fg-faint">
          <svg className="h-3.5 w-3.5 animate-spin text-accent-blue" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Watching for first fleet activity ({elapsed}s)
        </div>
      )}
      {status === "detected" && (
        <p className="text-xs text-success">Host detected — advancing…</p>
      )}
      {status === "timeout" && (
        <p className="text-xs text-warning">
          No activity yet. That&apos;s fine — finish setup and use{" "}
          <Link href="/dashboard" className="font-medium text-accent-blue hover:underline">
            Dashboard → Run scan
          </Link>{" "}
          once your host is connected.
        </p>
      )}
      <div className="flex gap-2">
        {status !== "detected" && (
          <Button type="button" onClick={onNext}>
            {status === "timeout" ? "Skip for now" : "Continue"}
          </Button>
        )}
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
            A <strong className="font-medium text-fg-primary">scan</strong> is a read-only pass that records how the
            server is configured right now (no reboots, no package installs, no config writes). Blackglass compares that
            picture to your approved <strong className="font-medium text-fg-primary">baseline</strong> to flag anything
            that drifted.
          </p>
          <p className="text-sm text-fg-muted">
            Operators start scans from the{" "}
            <Link href="/dashboard" className="font-medium text-accent-blue hover:underline">
              Dashboard
            </Link>{" "}
            using <strong className="text-fg-primary">Run scan</strong>, or your team may configure automatic schedules
            in deployment settings.
          </p>
          <p className="text-sm text-fg-muted">
            Technically, each run gathers listeners, user accounts, selected systemd units, effective SSH settings,
            firewall posture, and package metadata — enough to spot risky drift without touching application secrets.
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
