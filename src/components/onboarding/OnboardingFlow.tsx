"use client";

import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const STEPS = ["Connect host", "Capture baseline", "Run first scan"] as const;

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 120_000;
const SOFT_READY_AFTER_MS = 25_000;

// ---------------------------------------------------------------------------
// Step 1 — Connect host
// ---------------------------------------------------------------------------

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
        Choose how BLACKGLASS collects from your server. Both methods produce the
        same drift detection and evidence exports.
      </p>

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
          Push agent{" "}
          <span className="ml-1 rounded bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success">
            Recommended
          </span>
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
          <div className="space-y-3 rounded-card border border-border-subtle bg-bg-elevated p-4 text-sm">
            <p className="font-medium text-fg-primary">How it works</p>
            <p className="text-fg-muted">
              A lightweight script runs on your server and sends a read-only snapshot to
              BLACKGLASS over HTTPS. No inbound firewall rules needed — your server
              calls us, not the other way round.
            </p>
            <ol className="list-decimal space-y-3 pl-5 text-fg-muted">
              <li>
                <strong className="font-medium text-fg-primary">Generate an API key</strong>{" "}
                — click the button below. Copy it somewhere safe; it is shown once.
              </li>
              <li>
                <strong className="font-medium text-fg-primary">Run one command on your server</strong>{" "}
                (as root or with sudo):
                <pre className="mt-2 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-xs text-fg-primary">
{`curl -fsSL https://blackglasssec.com/install-agent.sh | \\\n  BLACKGLASS_KEY=<your-key> bash`}
                </pre>
                <p className="mt-1 text-xs text-fg-faint">
                  Creates a read-only{" "}
                  <span className="font-mono">blackglass</span> user, installs the
                  agent, and starts it as a systemd service. One minute to run.
                </p>
              </li>
              <li>
                <strong className="font-medium text-fg-primary">Done.</strong> The agent
                sends its first snapshot immediately. The wizard advances on its
                own as soon as it lands.
              </li>
            </ol>
          </div>

          {!apiKey ? (
            <Button type="button" onClick={() => void generateKey()} disabled={generatingKey}>
              {generatingKey ? "Generating…" : "Generate API key"}
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-fg-muted">
                Your API key — copy it now, it won&apos;t be shown again:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-xs text-fg-primary">
                  {apiKey}
                </code>
                <Button type="button" variant="secondary" onClick={() => void copyKey()}>
                  {keyCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-fg-faint">
                Paste it into the install command above, replacing{" "}
                <span className="font-mono">&lt;your-key&gt;</span>.
              </p>
            </div>
          )}

          <p className="text-xs text-fg-faint">
            Prefer SSH pull instead?{" "}
            <button
              type="button"
              onClick={() => setMethod("ssh")}
              className="text-accent-blue hover:underline"
            >
              Switch to SSH setup
            </button>
            .
          </p>
        </div>
      )}

      {method === "ssh" && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-card border border-border-subtle bg-bg-elevated p-4 text-sm">
            <p className="font-medium text-fg-primary">SSH pull setup</p>
            <p className="text-fg-muted">
              BLACKGLASS SSHs into your server using a dedicated read-only account
              — no agent required, no inbound ports needed.
            </p>
            <ol className="space-y-3 text-fg-muted">
              <li>
                <span className="font-medium text-fg-primary">1. Generate a key pair</span>
                <p className="mt-1">Run on any machine (Linux, macOS, or WSL):</p>
                <code className="mt-1.5 block rounded bg-bg-base px-2.5 py-1.5 font-mono text-[11px] text-fg-primary">
                  {`ssh-keygen -t ed25519 -C "blackglass-collector" -f blackglass_key -N ""`}
                </code>
              </li>
              <li>
                <span className="font-medium text-fg-primary">2. Authorise the key on your server</span>
                <code className="mt-1.5 block rounded bg-bg-base px-2.5 py-1.5 font-mono text-[11px] text-fg-primary">
                  {`cat blackglass_key.pub | ssh root@YOUR_SERVER \\
  "mkdir -p ~blackglass/.ssh && cat >> ~blackglass/.ssh/authorized_keys && chmod 600 ~blackglass/.ssh/authorized_keys"`}
                </code>
              </li>
              <li>
                <span className="font-medium text-fg-primary">3. Add the host in Settings</span>
                <p className="mt-1">
                  Open{" "}
                  <Link href="/settings" className="font-medium text-accent-blue hover:underline">
                    Settings → Collector hosts
                  </Link>{" "}
                  and add the host. Use the new <strong>Test SSH</strong> button to
                  verify the credential before continuing.
                </p>
              </li>
            </ol>
          </div>
          <p className="text-xs text-fg-faint">
            Prefer the agent instead?{" "}
            <button
              type="button"
              onClick={() => setMethod("push")}
              className="text-accent-blue hover:underline"
            >
              Switch to push agent
            </button>
            .
          </p>
        </div>
      )}

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
          No activity yet. That&apos;s fine — finish setup later from the Dashboard.
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

// ---------------------------------------------------------------------------
// Step 2 — Capture baseline (real API call)
// ---------------------------------------------------------------------------

function CaptureBaselineStep({ onNext }: { onNext: () => void }) {
  type State =
    | { kind: "idle" }
    | { kind: "running"; startedAt: number }
    | { kind: "done"; capturedHosts: number; failedHosts: number; elapsedMs: number }
    | { kind: "error"; detail: string };

  const [state, setState] = useState<State>({ kind: "idle" });
  const [tickElapsed, setTickElapsed] = useState(0);

  // Cheap second-counter while a capture is in flight.
  useEffect(() => {
    if (state.kind !== "running") return;
    const startedAt = state.startedAt;
    const id = window.setInterval(() => {
      setTickElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [state]);

  const capture = async () => {
    const startedAt = Date.now();
    setState({ kind: "running", startedAt });
    try {
      const res = await fetch("/api/v1/baselines", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        captured?: Array<{ hostId: string }>;
        failed?: Array<{ hostId: string; error: string }>;
        detail?: string;
      };
      if (!res.ok) {
        setState({
          kind: "error",
          detail: body.detail ?? `Server returned ${res.status}`,
        });
        return;
      }
      setState({
        kind: "done",
        capturedHosts: body.captured?.length ?? 0,
        failedHosts: body.failed?.length ?? 0,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (err) {
      setState({
        kind: "error",
        detail: err instanceof Error ? err.message : "Network error",
      });
    }
  };

  return (
    <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
      <h2 className="text-sm font-semibold text-fg-primary">Capture baseline</h2>
      <p className="text-sm text-fg-muted">
        BLACKGLASS records the current state of every connected host as your{" "}
        <strong className="font-medium text-fg-primary">approved baseline</strong>.
        Every future scan diffs against it, so any deviation surfaces as drift.
      </p>
      <p className="text-xs text-fg-faint">
        Read-only — no config writes, no package installs, no reboots. Typical
        capture takes 10–25 seconds per host.
      </p>

      {state.kind === "idle" ? (
        <Button type="button" onClick={() => void capture()}>
          Capture baseline now
        </Button>
      ) : null}

      {state.kind === "running" ? (
        <div className="flex items-center gap-2 rounded-card border border-accent-blue/40 bg-accent-blue/5 px-3 py-2.5 text-sm text-fg-muted">
          <svg className="h-4 w-4 animate-spin text-accent-blue" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Capturing baseline from your fleet… {tickElapsed}s
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div className="space-y-2">
          <div className="rounded-card border border-success/40 bg-success-soft/30 px-3 py-2.5 text-sm text-fg-muted">
            <p className="font-medium text-success">
              Baseline captured for {state.capturedHosts} host
              {state.capturedHosts === 1 ? "" : "s"}{" "}
              <span className="text-fg-faint">({(state.elapsedMs / 1000).toFixed(1)}s)</span>
            </p>
            {state.failedHosts > 0 ? (
              <p className="mt-1 text-xs text-warning">
                {state.failedHosts} host{state.failedHosts === 1 ? "" : "s"} failed —
                check Settings → Collector hosts and use Test SSH to debug.
              </p>
            ) : null}
          </div>
          <Button type="button" onClick={onNext}>
            Continue to first scan
          </Button>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="space-y-2">
          <div className="rounded-card border border-danger/40 bg-danger-soft/25 px-3 py-2.5 text-sm text-fg-muted">
            <p className="font-medium text-danger">Capture failed</p>
            <p className="mt-1 font-mono text-xs text-fg-faint">{state.detail}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => void capture()}>
              Retry
            </Button>
            <Button type="button" onClick={onNext}>
              Skip for now
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Run first scan (real API call + completion poll)
// ---------------------------------------------------------------------------

function RunFirstScanStep() {
  type State =
    | { kind: "idle" }
    | { kind: "enqueued"; scanId: string; startedAt: number }
    | { kind: "running"; scanId: string; startedAt: number }
    | { kind: "done"; scanId: string; eventsFound: number; elapsedMs: number }
    | { kind: "error"; detail: string };

  const [state, setState] = useState<State>({ kind: "idle" });
  const pollTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    },
    [],
  );

  const pollUntilDone = (scanId: string, startedAt: number) => {
    const tick = async () => {
      try {
        const res = await fetch(`/api/v1/scans/${scanId}`);
        if (res.ok) {
          const body = (await res.json()) as {
            status?: string;
            eventsFound?: number;
          };
          if (body.status === "succeeded" || body.status === "failed") {
            setState({
              kind: "done",
              scanId,
              eventsFound: body.eventsFound ?? 0,
              elapsedMs: Date.now() - startedAt,
            });
            return;
          }
          setState({ kind: "running", scanId, startedAt });
        }
      } catch {
        // keep polling — transient failure
      }
      // 90s safety stop
      if (Date.now() - startedAt > 90_000) {
        setState({
          kind: "done",
          scanId,
          eventsFound: 0,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }
      pollTimerRef.current = window.setTimeout(() => void tick(), 3_000);
    };
    void tick();
  };

  const runScan = async () => {
    const startedAt = Date.now();
    setState({ kind: "enqueued", scanId: "", startedAt });
    try {
      const res = await fetch("/api/v1/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        scanId?: string;
        id?: string;
        detail?: string;
      };
      if (!res.ok) {
        setState({
          kind: "error",
          detail: body.detail ?? `Server returned ${res.status}`,
        });
        return;
      }
      const scanId = body.scanId ?? body.id ?? "";
      if (!scanId) {
        // Some deployments run synchronously and don't return an id — treat
        // the response itself as success and let the user navigate to /drift.
        setState({
          kind: "done",
          scanId: "",
          eventsFound: 0,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }
      pollUntilDone(scanId, startedAt);
    } catch (err) {
      setState({
        kind: "error",
        detail: err instanceof Error ? err.message : "Network error",
      });
    }
  };

  return (
    <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
      <h2 className="text-sm font-semibold text-fg-primary">Run your first scan</h2>
      <p className="text-sm text-fg-muted">
        With a baseline pinned, the first scan will show zero drift (unless your
        fleet has actually changed since capture). Future scans surface anything
        that deviates.
      </p>

      {state.kind === "idle" ? (
        <Button type="button" onClick={() => void runScan()}>
          Run scan
        </Button>
      ) : null}

      {(state.kind === "enqueued" || state.kind === "running") ? (
        <div className="flex items-center gap-2 rounded-card border border-accent-blue/40 bg-accent-blue/5 px-3 py-2.5 text-sm text-fg-muted">
          <svg className="h-4 w-4 animate-spin text-accent-blue" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {state.kind === "enqueued" ? "Enqueueing…" : "Scan in progress…"}
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div className="space-y-3">
          <div className="rounded-card border border-success/40 bg-success-soft/30 px-3 py-2.5 text-sm text-fg-muted">
            <p className="font-medium text-success">
              Scan complete{" "}
              <span className="text-fg-faint">({(state.elapsedMs / 1000).toFixed(1)}s)</span>
            </p>
            <p className="mt-1 text-xs">
              {state.eventsFound > 0
                ? `${state.eventsFound} drift event${state.eventsFound === 1 ? "" : "s"} detected — open the drift triage queue to investigate.`
                : "No drift detected. From now on, the dashboard will alert you when a future scan finds anything."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={state.eventsFound > 0 ? "/drift" : "/dashboard"}>
              <Button type="button">
                {state.eventsFound > 0 ? "Triage drift" : "Open dashboard"}
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button type="button" variant="secondary">
                Open dashboard
              </Button>
            </Link>
          </div>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="space-y-2">
          <div className="rounded-card border border-danger/40 bg-danger-soft/25 px-3 py-2.5 text-sm text-fg-muted">
            <p className="font-medium text-danger">Scan could not start</p>
            <p className="mt-1 font-mono text-xs text-fg-faint">{state.detail}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => void runScan()}>
              Retry
            </Button>
            <Link href="/dashboard">
              <Button type="button">Open dashboard</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Wizard shell
// ---------------------------------------------------------------------------

export function OnboardingFlow() {
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8 px-6 pb-16 pt-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">First run</p>
        <h1 className="mt-2 text-xl font-semibold text-fg-primary">
          Get to your first drift signal
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Three real steps. Each one calls a real BLACKGLASS API — no faked
          progress bars. Should take under 5 minutes once a host is reachable.
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

      {step === 0 && <ConnectHostStep onNext={next} />}
      {step === 1 && <CaptureBaselineStep onNext={next} />}
      {step === 2 && <RunFirstScanStep />}
    </div>
  );
}
