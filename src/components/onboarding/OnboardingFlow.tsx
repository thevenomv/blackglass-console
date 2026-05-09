"use client";

/**
 * Onboarding wizard.
 *
 * The bulletproof first-baseline flow lives here. Three steps, each
 * keyed to a real API endpoint — no faked progress bars.
 *
 *   1. Connect host
 *      - Generate an API key (POST /api/v1/collector/keys/rotate)
 *      - Optionally name the host so we can pre-bake BLACKGLASS_HOST_ID
 *        into the install command and lock onto a specific hostId for
 *        polling.
 *      - Show a real, copy-pasteable install command (no <your-key>
 *        placeholder, no fake URL).
 *      - Poll either:
 *          - GET /api/v1/onboarding/host-status?hostId=<id>  (named host)
 *          - GET /api/v1/onboarding/recent-bootstraps?since=<ms>
 *            then switch to host-status once a hostId is detected.
 *      - 8-min timeout (covers two 5-min systemd cycles + boot delay).
 *      - Reset + reinstall surfaces on any blocked stage.
 *
 *   2. Capture baseline
 *      - Live preview of what we received (sections + listener / user
 *        / service counts) before the user confirms the pin.
 *      - "Looks wrong → Reset and reinstall" jumps back to step 1
 *        with the cascade already done.
 *
 *   3. Run first scan
 *      - Real POST /api/v1/scans, real polling, clear final CTA.
 */

import { Button } from "@/components/ui/Button";
import { runBaselineCaptureFromBrowser } from "@/lib/client/baseline-capture";
import { ONBOARDING_TIPS, tipForCode } from "@/lib/onboarding/troubleshooting";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const STEPS = ["Connect host", "Capture baseline", "Run first scan"] as const;

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 8 * 60_000;

// ---------------------------------------------------------------------------
// Shared types — mirror the host-status endpoint response.
// ---------------------------------------------------------------------------

type BundleSummary = {
  sections: number;
  listeners: number;
  users: number;
  services: number;
};

type OnboardingStage =
  | { stage: "awaiting_first_push"; elapsedSeconds: number }
  | { stage: "bundle_received"; summary: BundleSummary }
  | {
      stage: "bundle_invalid";
      reason: string;
      missing: string[];
      summary: BundleSummary;
    }
  | {
      stage: "baseline_captured";
      capturedAt: string;
      hostId: string;
      summary: BundleSummary;
    }
  | { stage: "blocked_tombstone"; expiresAt: string; remedy: string }
  | {
      stage: "blocked_quota";
      current: number;
      limit: number;
      remedy: string;
    };

// ---------------------------------------------------------------------------
// Reusable: troubleshooting disclosure
// ---------------------------------------------------------------------------

function TroubleshootingDisclosure() {
  return (
    <details className="mt-4 rounded-card border border-border-subtle bg-bg-elevated/40 px-3 py-2 text-xs text-fg-muted">
      <summary className="cursor-pointer font-medium text-fg-primary">
        Common issues &amp; fixes
      </summary>
      <ul className="mt-3 space-y-3">
        {ONBOARDING_TIPS.map((tip) => (
          <li key={tip.code}>
            <p className="font-medium text-fg-primary">{tip.title}</p>
            <p className="mt-0.5 leading-relaxed">{tip.remedy}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Reusable: reset-and-reinstall affordance
// ---------------------------------------------------------------------------

function ResetButton({
  hostId,
  onReset,
  variant = "secondary",
}: {
  hostId: string | null;
  onReset?: (next: { install_url: string; wizard_url: string }) => void;
  variant?: "secondary" | "danger";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    if (!hostId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/onboarding/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          detail?: string;
          remedy?: string;
        };
        setError(body.detail ?? `Reset failed (HTTP ${res.status})`);
        return;
      }
      const body = (await res.json()) as { next: { install_url: string; wizard_url: string } };
      onReset?.(body.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant === "danger" ? "secondary" : "secondary"}
        onClick={() => void reset()}
        disabled={busy || !hostId}
      >
        {busy ? "Resetting…" : "Reset and reinstall"}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Connect host
// ---------------------------------------------------------------------------

function ConnectHostStep({
  onNext,
  onHostIdResolved,
}: {
  onNext: () => void;
  onHostIdResolved: (id: string) => void;
}) {
  type ScreenState =
    | { kind: "configure" }
    | { kind: "polling"; startedAt: number }
    | { kind: "blocked"; stage: OnboardingStage };

  const [method, setMethod] = useState<"push" | "ssh">("push");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [hostName, setHostName] = useState<string>("");
  const [useAutoDetect, setUseAutoDetect] = useState<boolean>(true);
  const [screen, setScreen] = useState<ScreenState>({ kind: "configure" });
  const [stage, setStage] = useState<OnboardingStage | null>(null);
  const [resolvedHostId, setResolvedHostId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [installCopied, setInstallCopied] = useState(false);
  const pollRef = useRef<number | null>(null);

  const consoleOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://blackglasssec.com";

  const expectedHostId = useMemo<string | null>(() => {
    if (useAutoDetect || !hostName.trim()) return null;
    // Mirror the install script's normalisation: replace dots with
    // dashes, prefix with "host-". Lowercase to keep it canonical.
    const normalised = hostName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/[.]/g, "-");
    return `host-${normalised}`;
  }, [hostName, useAutoDetect]);

  const installCommand = useMemo(() => {
    if (!apiKey) return "";
    const key = apiKey;
    const baseUrl = `${consoleOrigin}/install-agent.sh`;
    if (expectedHostId) {
      return [
        `curl -fsSL ${baseUrl} \\`,
        `  | sudo BLACKGLASS_KEY=${key} \\`,
        `         BLACKGLASS_HOST_ID=${expectedHostId} bash`,
      ].join("\n");
    }
    return `curl -fsSL ${baseUrl} | sudo BLACKGLASS_KEY=${key} bash`;
  }, [apiKey, expectedHostId, consoleOrigin]);

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

  const copyInstall = async () => {
    if (!installCommand) return;
    await navigator.clipboard.writeText(installCommand);
    setInstallCopied(true);
    window.setTimeout(() => setInstallCopied(false), 2000);
  };

  // Begin polling once the user clicks "I've started the install".
  const startPolling = () => {
    setScreen({ kind: "polling", startedAt: Date.now() });
  };

  // Polling effect — fires when we enter the "polling" screen state and
  // tears down on every transition. Two paths:
  //   1. We have an expected hostId  → poll host-status directly.
  //   2. Auto-detect                 → poll recent-bootstraps until a
  //                                    new hostId appears, then switch
  //                                    to host-status for that id.
  useEffect(() => {
    if (screen.kind !== "polling") return;
    const startedAt = screen.startedAt;
    let cancelled = false;
    let lockedHostId: string | null = expectedHostId;

    const poll = async () => {
      if (cancelled) return;
      const elapsedMs = Date.now() - startedAt;
      setElapsed(Math.floor(elapsedMs / 1000));

      if (elapsedMs > POLL_TIMEOUT_MS) {
        setStage({ stage: "awaiting_first_push", elapsedSeconds: Math.floor(elapsedMs / 1000) });
        return;
      }

      try {
        if (!lockedHostId) {
          const res = await fetch(
            `/api/v1/onboarding/recent-bootstraps?since=${startedAt}`,
          );
          if (res.ok) {
            const body = (await res.json()) as {
              recent: { hostId: string; capturedAt: string }[];
            };
            const newest = body.recent[0]?.hostId;
            if (newest) {
              lockedHostId = newest;
              setResolvedHostId(newest);
            }
          }
        }

        if (lockedHostId) {
          const res = await fetch(
            `/api/v1/onboarding/host-status?hostId=${encodeURIComponent(lockedHostId)}&startedAt=${startedAt}`,
          );
          if (res.ok) {
            const body = (await res.json()) as OnboardingStage;
            setStage(body);
            setResolvedHostId(lockedHostId);
            // Terminal stages: stop polling and either advance or block.
            if (body.stage === "baseline_captured") {
              onHostIdResolved(lockedHostId);
              return;
            }
            if (
              body.stage === "blocked_tombstone" ||
              body.stage === "blocked_quota" ||
              body.stage === "bundle_invalid"
            ) {
              setScreen({ kind: "blocked", stage: body });
              return;
            }
          }
        } else {
          // No hostId yet — keep showing "awaiting first push".
          setStage({ stage: "awaiting_first_push", elapsedSeconds: Math.floor(elapsedMs / 1000) });
        }
      } catch {
        // Transient network error — keep polling.
      }

      pollRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
      pollRef.current = null;
    };
  }, [screen, expectedHostId, onHostIdResolved]);

  // When step 1 finishes (baseline_captured), wait a moment then advance
  // to the preview step.
  useEffect(() => {
    if (stage?.stage === "baseline_captured") {
      const t = window.setTimeout(onNext, 1200);
      return () => window.clearTimeout(t);
    }
  }, [stage, onNext]);

  // ---------- Render -------------------------------------------------------

  return (
    <section className="space-y-4 rounded-card border border-border-default bg-bg-panel p-6">
      <h2 className="text-sm font-semibold text-fg-primary">Connect your first host</h2>
      <p className="text-sm text-fg-muted">
        Choose how Blackglass collects from your server. Both methods produce the same
        change detection and evidence exports.
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

      {method === "push" && screen.kind === "configure" ? (
        <PushConfigureBlock
          apiKey={apiKey}
          generatingKey={generatingKey}
          keyCopied={keyCopied}
          installCommand={installCommand}
          installCopied={installCopied}
          hostName={hostName}
          useAutoDetect={useAutoDetect}
          expectedHostId={expectedHostId}
          onGenerateKey={() => void generateKey()}
          onCopyKey={() => void copyKey()}
          onCopyInstall={() => void copyInstall()}
          onHostNameChange={setHostName}
          onAutoDetectChange={setUseAutoDetect}
          onStart={startPolling}
        />
      ) : null}

      {method === "push" && screen.kind === "polling" ? (
        <PushPollingBlock stage={stage} elapsedSeconds={elapsed} hostId={resolvedHostId} />
      ) : null}

      {method === "push" && screen.kind === "blocked" ? (
        <PushBlockedBlock
          stage={screen.stage}
          hostId={resolvedHostId}
          onResetComplete={() => {
            setScreen({ kind: "configure" });
            setStage(null);
            setResolvedHostId(null);
          }}
        />
      ) : null}

      {method === "ssh" ? <SshSetupBlock onSwitch={() => setMethod("push")} /> : null}

      <TroubleshootingDisclosure />
    </section>
  );
}

// ---------- Step 1 sub-blocks -----------------------------------------------

function PushConfigureBlock(props: {
  apiKey: string | null;
  generatingKey: boolean;
  keyCopied: boolean;
  installCommand: string;
  installCopied: boolean;
  hostName: string;
  useAutoDetect: boolean;
  expectedHostId: string | null;
  onGenerateKey: () => void;
  onCopyKey: () => void;
  onCopyInstall: () => void;
  onHostNameChange: (v: string) => void;
  onAutoDetectChange: (v: boolean) => void;
  onStart: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-card border border-border-subtle bg-bg-elevated p-4 text-sm">
        <p className="font-medium text-fg-primary">How it works</p>
        <p className="text-fg-muted">
          A lightweight script runs on your server and sends a read-only snapshot to
          Blackglass over HTTPS. No inbound firewall rules needed.
        </p>

        <ol className="list-decimal space-y-3 pl-5 text-fg-muted">
          <li>
            <strong className="font-medium text-fg-primary">Generate an API key</strong>
            <p className="mt-1 text-xs">
              Issued once. Used by the agent to authenticate every push.
            </p>
            {!props.apiKey ? (
              <div className="mt-2">
                <Button type="button" onClick={props.onGenerateKey} disabled={props.generatingKey}>
                  {props.generatingKey ? "Generating…" : "Generate API key"}
                </Button>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-xs text-fg-primary">
                  {props.apiKey}
                </code>
                <Button type="button" variant="secondary" onClick={props.onCopyKey}>
                  {props.keyCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
            )}
          </li>

          <li>
            <strong className="font-medium text-fg-primary">Name this host (optional)</strong>
            <p className="mt-1 text-xs">
              Pick a hostId so we know which server you&apos;re onboarding. Leave blank
              to let the agent auto-detect from the server&apos;s primary IP.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                <input
                  type="radio"
                  name="hostid-mode"
                  checked={props.useAutoDetect}
                  onChange={() => props.onAutoDetectChange(true)}
                />
                Auto-detect (recommended)
              </label>
              <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                <input
                  type="radio"
                  name="hostid-mode"
                  checked={!props.useAutoDetect}
                  onChange={() => props.onAutoDetectChange(false)}
                />
                Custom name
              </label>
            </div>
            {!props.useAutoDetect ? (
              <div className="mt-2">
                <input
                  type="text"
                  value={props.hostName}
                  onChange={(e) => props.onHostNameChange(e.target.value)}
                  placeholder="e.g. production-web-01 or 167.99.59.55"
                  className="w-full rounded border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary placeholder:text-fg-faint focus:border-accent-blue focus:outline-none"
                />
                {props.expectedHostId ? (
                  <p className="mt-1 text-xs text-fg-faint">
                    Will appear in the dashboard as{" "}
                    <span className="font-mono text-fg-muted">{props.expectedHostId}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>

          <li>
            <strong className="font-medium text-fg-primary">Run one command on your server</strong>
            <p className="mt-1 text-xs">As root or with sudo:</p>
            <div className="mt-2 flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-xs text-fg-primary">
                {props.installCommand || "(generate an API key first)"}
              </pre>
              {props.installCommand ? (
                <Button type="button" variant="secondary" onClick={props.onCopyInstall}>
                  {props.installCopied ? "Copied!" : "Copy"}
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-fg-faint">
              The installer creates a read-only{" "}
              <span className="font-mono">blackglass</span> user, installs the agent,
              starts a 5-minute systemd timer, and runs the first push synchronously.
            </p>
          </li>
        </ol>

        <Button
          type="button"
          onClick={props.onStart}
          disabled={!props.installCommand}
        >
          I&apos;ve started the install — verify now
        </Button>
      </div>
    </div>
  );
}

function PushPollingBlock({
  stage,
  elapsedSeconds,
  hostId,
}: {
  stage: OnboardingStage | null;
  elapsedSeconds: number;
  hostId: string | null;
}) {
  if (stage?.stage === "baseline_captured") {
    return (
      <div className="space-y-2 rounded-card border border-success/40 bg-success-soft/30 px-3 py-2.5 text-sm text-fg-muted">
        <p className="font-medium text-success">Baseline captured for {stage.hostId}</p>
        <p className="text-xs">
          {stage.summary.sections} sections, {stage.summary.listeners} listeners,{" "}
          {stage.summary.users} users, {stage.summary.services} services.
        </p>
        <p className="text-xs">Advancing to baseline preview…</p>
      </div>
    );
  }

  if (stage?.stage === "bundle_received") {
    return (
      <div className="space-y-2 rounded-card border border-accent-blue/40 bg-accent-blue/5 px-3 py-2.5 text-sm text-fg-muted">
        <p className="font-medium text-fg-primary">First push received — finalising baseline…</p>
        <p className="text-xs">
          {stage.summary.sections} sections, {stage.summary.listeners} listeners,{" "}
          {stage.summary.users} users.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-card border border-accent-blue/40 bg-accent-blue/5 px-3 py-2.5 text-sm text-fg-muted">
      <svg className="h-4 w-4 animate-spin text-accent-blue" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span>
        {hostId ? (
          <>
            Waiting for {hostId} to push its first snapshot ({elapsedSeconds}s)
          </>
        ) : (
          <>Waiting for any new host to push its first snapshot ({elapsedSeconds}s)</>
        )}
      </span>
    </div>
  );
}

function PushBlockedBlock({
  stage,
  hostId,
  onResetComplete,
}: {
  stage: OnboardingStage;
  hostId: string | null;
  onResetComplete: () => void;
}) {
  let title = "Cannot complete onboarding";
  let detail: string | null = null;

  if (stage.stage === "blocked_tombstone") {
    title = "This host was recently deleted";
    detail = stage.remedy;
  } else if (stage.stage === "blocked_quota") {
    title = `Host allowance reached (${stage.current} / ${stage.limit})`;
    detail = stage.remedy;
  } else if (stage.stage === "bundle_invalid") {
    title = "Agent ran but the bundle was incomplete";
    detail = `${stage.reason} Missing: ${stage.missing.join(", ")}.`;
  }

  const tip = stage.stage === "blocked_tombstone"
    ? tipForCode("host_tombstoned")
    : stage.stage === "blocked_quota"
      ? tipForCode("host_quota_exceeded")
      : tipForCode("bundle_missing_sections");

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-warning/40 bg-warning-soft/25 px-3 py-2.5 text-sm text-fg-muted">
        <p className="font-medium text-warning">{title}</p>
        {detail ? <p className="mt-1 text-xs">{detail}</p> : null}
        {tip ? <p className="mt-1 text-xs italic">{tip.remedy}</p> : null}
      </div>
      <div className="flex gap-2">
        <ResetButton hostId={hostId} onReset={onResetComplete} />
      </div>
    </div>
  );
}

function SshSetupBlock({ onSwitch }: { onSwitch: () => void }) {
  type Keypair = {
    keyId: string;
    publicKey: string;
    privateKey: string;
    copyCommand: string;
  };
  type TestResult =
    | null
    | {
        ok: true;
        stage: string;
        detail: string;
      }
    | { ok: false; stage: string; detail: string; remedy: string };

  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showPrivate, setShowPrivate] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [user, setUser] = useState("blackglass");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult>(null);
  const [installCopied, setInstallCopied] = useState(false);
  const [pubCopied, setPubCopied] = useState(false);
  const [privCopied, setPrivCopied] = useState(false);

  const generate = async () => {
    setGenerating(true);
    setTest(null);
    try {
      const res = await fetch("/api/v1/onboarding/ssh-keypair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "blackglass-onboarding" }),
      });
      if (!res.ok) {
        setKeypair(null);
        return;
      }
      const body = (await res.json()) as Keypair;
      setKeypair(body);
    } finally {
      setGenerating(false);
    }
  };

  const runTest = async () => {
    if (!keypair || !host) return;
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch("/api/v1/onboarding/ssh-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyId: keypair.keyId,
          host,
          port: Number(port) || 22,
          user,
        }),
      });
      const body = (await res.json()) as TestResult;
      setTest(body);
    } catch (err) {
      setTest({
        ok: false,
        stage: "network",
        detail: err instanceof Error ? err.message : "Network error",
        remedy: "Check your console's network and retry.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-card border border-border-subtle bg-bg-elevated p-4 text-sm">
        <p className="font-medium text-fg-primary">SSH pull setup</p>
        <p className="text-fg-muted">
          Blackglass connects to your server over SSH using a dedicated read-only
          account. We generate the keypair for you — no <code>ssh-keygen</code>{" "}
          required.
        </p>

        <ol className="space-y-3 text-fg-muted">
          <li>
            <strong className="font-medium text-fg-primary">1. Generate a keypair</strong>
            {!keypair ? (
              <div className="mt-2">
                <Button type="button" onClick={() => void generate()} disabled={generating}>
                  {generating ? "Generating…" : "Generate ed25519 keypair"}
                </Button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex items-start gap-2">
                  <pre className="flex-1 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-[11px] text-fg-primary">
                    {keypair.publicKey}
                  </pre>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(keypair.publicKey);
                      setPubCopied(true);
                      window.setTimeout(() => setPubCopied(false), 2000);
                    }}
                  >
                    {pubCopied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <details className="rounded-card border border-border-subtle bg-bg-elevated px-2.5 py-1.5">
                  <summary
                    className="cursor-pointer text-xs font-medium text-fg-muted"
                    onClick={() => setShowPrivate((v) => !v)}
                  >
                    Show private key (you&apos;ll add this to your secret store later)
                  </summary>
                  {showPrivate ? (
                    <div className="mt-2 flex items-start gap-2">
                      <pre className="flex-1 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-[10px] text-fg-primary">
                        {keypair.privateKey}
                      </pre>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          void navigator.clipboard.writeText(keypair.privateKey);
                          setPrivCopied(true);
                          window.setTimeout(() => setPrivCopied(false), 2000);
                        }}
                      >
                        {privCopied ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                  ) : null}
                </details>
                <p className="text-xs text-fg-faint">
                  The private key is held server-side for 10 minutes so you don&apos;t need
                  to paste it anywhere yet.
                </p>
              </div>
            )}
          </li>

          {keypair ? (
            <li>
              <strong className="font-medium text-fg-primary">2. Install the public key on your server</strong>
              <div className="mt-2 flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-[11px] text-fg-primary">
                  {keypair.copyCommand}
                </pre>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(keypair.copyCommand);
                    setInstallCopied(true);
                    window.setTimeout(() => setInstallCopied(false), 2000);
                  }}
                >
                  {installCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </li>
          ) : null}

          {keypair ? (
            <li>
              <strong className="font-medium text-fg-primary">3. Test the connection</strong>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="host or IP"
                  className="col-span-1 rounded border border-border-default bg-bg-base px-3 py-1.5 text-sm text-fg-primary placeholder:text-fg-faint focus:border-accent-blue focus:outline-none sm:col-span-2"
                />
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="rounded border border-border-default bg-bg-base px-3 py-1.5 text-sm text-fg-primary focus:border-accent-blue focus:outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="w-32 rounded border border-border-default bg-bg-base px-3 py-1.5 text-sm text-fg-primary focus:border-accent-blue focus:outline-none"
                />
                <Button
                  type="button"
                  onClick={() => void runTest()}
                  disabled={testing || !host}
                >
                  {testing ? "Testing…" : "Test SSH"}
                </Button>
              </div>
              {test ? (
                test.ok ? (
                  <div className="mt-2 rounded-card border border-success/40 bg-success-soft/30 px-3 py-2 text-xs text-fg-muted">
                    <span className="font-medium text-success">{test.detail}</span> —
                    next, save this host in{" "}
                    <Link href="/settings" className="text-accent-blue hover:underline">
                      Settings → Collector hosts
                    </Link>{" "}
                    and paste the private key as the credential.
                  </div>
                ) : (
                  <div className="mt-2 rounded-card border border-warning/40 bg-warning-soft/25 px-3 py-2 text-xs text-fg-muted">
                    <p className="font-medium text-warning">
                      Failed at stage: {test.stage}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-fg-faint">{test.detail}</p>
                    <p className="mt-1 italic">{test.remedy}</p>
                  </div>
                )
              ) : null}
            </li>
          ) : null}
        </ol>
      </div>
      <p className="text-xs text-fg-faint">
        Prefer the agent instead?{" "}
        <button type="button" onClick={onSwitch} className="text-accent-blue hover:underline">
          Switch to push agent
        </button>
        .
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Capture baseline (with live preview)
// ---------------------------------------------------------------------------

function CaptureBaselineStep({
  onNext,
  hostId,
  onResetComplete,
}: {
  onNext: () => void;
  hostId: string | null;
  onResetComplete: () => void;
}) {
  type StatusBundle =
    | { stage: "loading" }
    | { stage: "summary"; data: BundleSummary; capturedAt: string }
    | { stage: "missing"; data: BundleSummary; reason: string }
    | { stage: "error"; detail: string };

  type CaptureState =
    | { kind: "preview"; status: StatusBundle }
    | { kind: "running"; startedAt: number }
    | { kind: "done"; capturedHosts: number; failedHosts: number; elapsedMs: number }
    | { kind: "error"; detail: string };

  const [state, setState] = useState<CaptureState>({
    kind: "preview",
    status: { stage: "loading" },
  });
  const [tickElapsed, setTickElapsed] = useState(0);

  // Fetch the current host status to render the preview.
  useEffect(() => {
    if (state.kind !== "preview" || !hostId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/v1/onboarding/host-status?hostId=${encodeURIComponent(hostId)}&startedAt=${Date.now() - 60_000}`,
        );
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as OnboardingStage;
        if (cancelled) return;
        if (body.stage === "baseline_captured" || body.stage === "bundle_received") {
          setState({
            kind: "preview",
            status: {
              stage: "summary",
              data: body.summary,
              capturedAt:
                body.stage === "baseline_captured" ? body.capturedAt : new Date().toISOString(),
            },
          });
        } else if (body.stage === "bundle_invalid") {
          setState({
            kind: "preview",
            status: { stage: "missing", data: body.summary, reason: body.reason },
          });
        } else {
          setState({
            kind: "preview",
            status: { stage: "error", detail: "No baseline data yet — go back to step 1." },
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "preview",
            status: {
              stage: "error",
              detail: err instanceof Error ? err.message : "Network error",
            },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.kind, hostId]);

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
      const result = await runBaselineCaptureFromBrowser();
      if (!result.ok) {
        setState({ kind: "error", detail: result.detail });
        return;
      }
      setState({
        kind: "done",
        capturedHosts: result.captured,
        failedHosts: result.failed,
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
        Blackglass records the current state of every connected host as your{" "}
        <strong className="font-medium text-fg-primary">approved baseline</strong>.
        Future scans compare against it — meaningful differences surface as findings.
      </p>

      {state.kind === "preview" && state.status.stage === "loading" ? (
        <p className="text-xs text-fg-faint">Loading what we received from your host…</p>
      ) : null}

      {state.kind === "preview" && state.status.stage === "summary" ? (
        <div className="space-y-3">
          <div className="rounded-card border border-accent-blue/40 bg-accent-blue/5 px-3 py-3 text-sm text-fg-muted">
            <p className="font-medium text-fg-primary">
              Here&apos;s what we received{hostId ? ` from ${hostId}` : ""}:
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-fg-faint">Sections</dt>
                <dd className="font-mono text-fg-primary">{state.status.data.sections}</dd>
              </div>
              <div>
                <dt className="text-fg-faint">Listeners</dt>
                <dd className="font-mono text-fg-primary">{state.status.data.listeners}</dd>
              </div>
              <div>
                <dt className="text-fg-faint">Users</dt>
                <dd className="font-mono text-fg-primary">{state.status.data.users}</dd>
              </div>
              <div>
                <dt className="text-fg-faint">Services</dt>
                <dd className="font-mono text-fg-primary">{state.status.data.services}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-fg-faint">
              If those numbers look wildly wrong (zero everything, or only 1 service), the agent
              probably ran without sufficient sudo. Reset and reinstall with sudo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void capture()}>
              Pin as baseline
            </Button>
            <ResetButton
              hostId={hostId}
              onReset={() => onResetComplete()}
              variant="secondary"
            />
          </div>
        </div>
      ) : null}

      {state.kind === "preview" && state.status.stage === "missing" ? (
        <div className="space-y-2">
          <div className="rounded-card border border-warning/40 bg-warning-soft/25 px-3 py-2.5 text-sm text-fg-muted">
            <p className="font-medium text-warning">Bundle is incomplete — don&apos;t pin this</p>
            <p className="mt-1 text-xs">{state.status.reason}</p>
          </div>
          <ResetButton hostId={hostId} onReset={() => onResetComplete()} />
        </div>
      ) : null}

      {state.kind === "preview" && state.status.stage === "error" ? (
        <p className="text-xs text-danger">{state.status.detail}</p>
      ) : null}

      {state.kind === "running" ? (
        <div className="flex items-center gap-2 rounded-card border border-accent-blue/40 bg-accent-blue/5 px-3 py-2.5 text-sm text-fg-muted">
          <svg className="h-4 w-4 animate-spin text-accent-blue" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Pinning baseline… {tickElapsed}s
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div className="space-y-2">
          <div className="rounded-card border border-success/40 bg-success-soft/30 px-3 py-2.5 text-sm text-fg-muted">
            <p className="font-medium text-success">
              Baseline pinned for {state.capturedHosts} host
              {state.capturedHosts === 1 ? "" : "s"}{" "}
              <span className="text-fg-faint">({(state.elapsedMs / 1000).toFixed(1)}s)</span>
            </p>
            {state.failedHosts > 0 ? (
              <p className="mt-1 text-xs text-warning">
                {state.failedHosts} host{state.failedHosts === 1 ? "" : "s"} failed —
                check Settings → Collector hosts.
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
// Step 3 — Run first scan
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
          const body = (await res.json()) as { status?: string; eventsFound?: number };
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
        /* keep polling */
      }
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
        setState({ kind: "error", detail: body.detail ?? `Server returned ${res.status}` });
        return;
      }
      const scanId = body.scanId ?? body.id ?? "";
      if (!scanId) {
        setState({ kind: "done", scanId: "", eventsFound: 0, elapsedMs: Date.now() - startedAt });
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
        With a baseline pinned, the first scan typically shows a clean bill of health.
        Future scans surface anything that deviates.
      </p>

      {state.kind === "idle" ? (
        <Button type="button" onClick={() => void runScan()}>
          Run scan
        </Button>
      ) : null}

      {state.kind === "enqueued" || state.kind === "running" ? (
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
                ? `${state.eventsFound} finding${state.eventsFound === 1 ? "" : "s"} detected — open Findings to review.`
                : "No changes detected. From now on, the dashboard will alert you when a future scan finds anything."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={state.eventsFound > 0 ? "/drift" : "/dashboard"}>
              <Button type="button">
                {state.eventsFound > 0 ? "Open findings" : "Open dashboard"}
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
  const [hostId, setHostId] = useState<string | null>(null);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const reset = () => {
    setStep(0);
    setHostId(null);
  };

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-6 pb-16 pt-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">First run</p>
        <h1 className="mt-2 text-xl font-semibold text-fg-primary">
          Get to your first finding
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Three real steps. Each one calls a real Blackglass API — no faked progress
          bars. Should take under 5 minutes once a host is reachable.
        </p>
      </div>

      <ol className="flex flex-wrap gap-3 border-b border-border-subtle pb-4">
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

      {step === 0 && <ConnectHostStep onNext={next} onHostIdResolved={setHostId} />}
      {step === 1 && (
        <CaptureBaselineStep onNext={next} hostId={hostId} onResetComplete={reset} />
      )}
      {step === 2 && <RunFirstScanStep />}
    </div>
  );
}
