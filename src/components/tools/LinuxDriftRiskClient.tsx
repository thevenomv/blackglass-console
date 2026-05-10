"use client";

/**
 * Linux Drift Risk Score — interactive 5-question form + score panel.
 *
 * Same architectural pattern as the Cloud Waste Estimator client:
 *   - Pure scoring engine in `src/lib/tools/linux-drift-risk/engine.ts`.
 *   - This component owns presentation, accessibility, and state.
 *   - Live recompute on every input change (cheap, deterministic).
 *   - Dataaer events fire for the full funnel.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CONFIG_MGMT_LABELS,
  COMPLIANCE_LABELS,
  classifyDriftRiskBand,
  DISTRO_LABELS,
  emptyDriftRiskInput,
  scoreLinuxDriftRisk,
  SSH_KEY_PROCESS_LABELS,
  TELEMETRY_LABELS,
  type CompliancePressure,
  type ConfigMgmt,
  type DistroFamily,
  type DriftRiskInput,
  type DriftRiskResult,
  type ExistingTelemetry,
  type SshKeyProcess,
} from "@/lib/tools/linux-drift-risk/engine";
import { trackToolEvent } from "@/lib/tools/analytics";

const TOOL_SLUG = "linux-drift-risk";

const ALL_DISTROS: DistroFamily[] = ["deb", "rhel", "amzn", "suse", "alpine", "other"];
const ALL_CONFIG_MGMT: ConfigMgmt[] = ["consistent", "occasional", "none"];
const ALL_SSH: SshKeyProcess[] = ["automated", "documented", "ad-hoc"];
const ALL_COMPLIANCE: CompliancePressure[] = ["low", "moderate", "high"];
const ALL_TELEMETRY: ExistingTelemetry[] = ["comprehensive", "partial", "none"];

export function LinuxDriftRiskClient() {
  const [input, setInput] = useState<DriftRiskInput>(emptyDriftRiskInput);

  const openedFiredRef = useRef(false);
  useEffect(() => {
    if (openedFiredRef.current) return;
    openedFiredRef.current = true;
    trackToolEvent("tool_estimator_opened", { tool: TOOL_SLUG });
  }, []);

  const result = useMemo<DriftRiskResult>(() => scoreLinuxDriftRisk(input), [input]);

  // Debounced recompute event so radio-button-mashing doesn't flood.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      trackToolEvent("tool_estimator_recomputed", {
        tool: TOOL_SLUG,
        risk_band: result.band,
        score: result.score,
      });
    }, 750);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [result]);

  const toggleDistro = (d: DistroFamily) => {
    setInput((prev) => {
      const has = prev.distros.includes(d);
      return {
        ...prev,
        distros: has
          ? prev.distros.filter((x) => x !== d)
          : [...prev.distros, d],
      };
    });
  };

  const reset = () => setInput(emptyDriftRiskInput());

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section
        aria-label="Drift risk questionnaire"
        className="space-y-6 rounded-card border border-border-default bg-bg-panel p-6"
      >
        <DistroPicker selected={input.distros} onToggle={toggleDistro} />

        <RadioGroup<ConfigMgmt>
          legend="Configuration management"
          name="config-mgmt"
          value={input.configMgmt}
          options={ALL_CONFIG_MGMT.map((v) => ({ value: v, label: CONFIG_MGMT_LABELS[v] }))}
          onChange={(v) => setInput((p) => ({ ...p, configMgmt: v }))}
        />

        <RadioGroup<SshKeyProcess>
          legend="SSH key process"
          name="ssh-keys"
          value={input.sshKeys}
          options={ALL_SSH.map((v) => ({ value: v, label: SSH_KEY_PROCESS_LABELS[v] }))}
          onChange={(v) => setInput((p) => ({ ...p, sshKeys: v }))}
        />

        <RadioGroup<CompliancePressure>
          legend="Compliance pressure"
          name="compliance"
          value={input.compliance}
          options={ALL_COMPLIANCE.map((v) => ({ value: v, label: COMPLIANCE_LABELS[v] }))}
          onChange={(v) => setInput((p) => ({ ...p, compliance: v }))}
        />

        <RadioGroup<ExistingTelemetry>
          legend="Existing telemetry"
          name="telemetry"
          value={input.telemetry}
          options={ALL_TELEMETRY.map((v) => ({ value: v, label: TELEMETRY_LABELS[v] }))}
          onChange={(v) => setInput((p) => ({ ...p, telemetry: v }))}
        />

        <div className="flex items-center justify-between border-t border-border-subtle pt-4">
          <p className="text-xs text-fg-faint">
            Score updates as you choose. Nothing leaves your browser.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-border-default bg-bg-base px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
          >
            Reset
          </button>
        </div>
      </section>

      <section aria-label="Drift risk score" className="space-y-5">
        <ScoreSummary result={result} />
        <TopClassesPanel result={result} />
        <ContributionsPanel result={result} />
        <RecommendationsPanel result={result} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form atoms
// ---------------------------------------------------------------------------

function DistroPicker({
  selected,
  onToggle,
}: {
  selected: DistroFamily[];
  onToggle: (d: DistroFamily) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-fg-primary">Distros in production</legend>
      <p className="mt-1 text-xs text-fg-faint">
        Pick all that apply. Mixed fleets get a small risk uplift because policy bases differ.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ALL_DISTROS.map((d) => {
          const active = selected.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(d)}
              className={
                active
                  ? "rounded-md border border-accent-blue bg-accent-blue-soft px-3 py-1.5 text-sm font-medium text-accent-blue"
                  : "rounded-md border border-border-default bg-bg-base px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
              }
            >
              {DISTRO_LABELS[d]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const groupId = useId();
  return (
    <fieldset aria-labelledby={`${groupId}-legend`}>
      <legend id={`${groupId}-legend`} className="text-sm font-semibold text-fg-primary">
        {legend}
      </legend>
      <div className="mt-2 space-y-2">
        {options.map((opt) => {
          const checked = opt.value === value;
          return (
            <label
              key={opt.value}
              className={
                checked
                  ? "flex cursor-pointer items-start gap-3 rounded-card border border-accent-blue bg-accent-blue-soft/40 px-3 py-2 text-sm text-fg-primary"
                  : "flex cursor-pointer items-start gap-3 rounded-card border border-border-subtle bg-bg-base px-3 py-2 text-sm text-fg-muted hover:border-accent-blue/40 hover:text-fg-primary"
              }
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-accent-blue"
              />
              <span className="leading-snug">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Result atoms
// ---------------------------------------------------------------------------

function ScoreSummary({ result }: { result: DriftRiskResult }) {
  return (
    <div className="rounded-card border border-border-default bg-bg-panel p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">
        Drift risk score
      </p>
      <div className="mt-1 flex items-baseline gap-3">
        <p className="text-4xl font-semibold tabular-nums text-fg-primary">{result.score}</p>
        <p className="text-sm text-fg-muted">/ 100</p>
        <BandPill band={result.band} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">{bandSummary(result.band)}</p>
    </div>
  );
}

function BandPill({ band }: { band: ReturnType<typeof classifyDriftRiskBand> }) {
  if (band === "critical") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft/40 px-2.5 py-0.5 text-xs font-medium text-danger">
        Critical
      </span>
    );
  }
  if (band === "high") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft/30 px-2.5 py-0.5 text-xs font-medium text-danger">
        High
      </span>
    );
  }
  if (band === "medium") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft/40 px-2.5 py-0.5 text-xs font-medium text-warning">
        Medium
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft/40 px-2.5 py-0.5 text-xs font-medium text-success">
      Low
    </span>
  );
}

function bandSummary(band: ReturnType<typeof classifyDriftRiskBand>): string {
  if (band === "critical") {
    return "Concentrated drift exposure. The first three months of continuous baselining are the highest-leverage thing you can do.";
  }
  if (band === "high") {
    return "Worth standing up continuous drift detection now — payback is fast and your audit responses get easier.";
  }
  if (band === "medium") {
    return "Solid foundations but real gaps. Quarterly drift review will surface most of the risk.";
  }
  return "Healthy posture. Annual baseline refresh and tagging discipline keep it that way.";
}

function TopClassesPanel({ result }: { result: DriftRiskResult }) {
  return (
    <div className="rounded-card border border-border-default bg-bg-panel p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">
        Top three drift classes for your shape
      </p>
      <ol className="mt-3 space-y-3 text-sm">
        {result.topClasses.map((c, i) => (
          <li key={c.id} className="flex gap-3">
            <span className="font-mono text-xs text-accent-blue">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <p className="font-medium text-fg-primary">{c.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{c.why}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ContributionsPanel({ result }: { result: DriftRiskResult }) {
  return (
    <details className="rounded-card border border-border-subtle bg-bg-panel/60 p-4 text-xs">
      <summary className="cursor-pointer text-fg-faint hover:text-fg-primary">
        How was this score computed?
      </summary>
      <ul className="mt-3 space-y-1.5 text-fg-muted">
        {result.contributions.map((c) => (
          <li key={c.label} className="flex items-start justify-between gap-3">
            <span className="leading-snug">{c.label}</span>
            <span className="font-mono text-fg-primary">+{c.points}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-fg-faint">
        Weights are calibrated for directional usefulness, not production-grade classification —
        the same blunt approach as the Cloud Waste Estimator.
      </p>
    </details>
  );
}

function RecommendationsPanel({ result }: { result: DriftRiskResult }) {
  return (
    <div className="rounded-card border border-border-default bg-bg-panel p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">
        What to do next
      </p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
        {result.recommendations.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/product"
          onClick={() =>
            trackToolEvent("tool_charon_cta_clicked", {
              tool: TOOL_SLUG,
              surface: "result_panel",
              cta: "blackglass",
            })
          }
          className="inline-flex items-center justify-center rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-blue-hover"
        >
          See how Blackglass baselines drift →
        </Link>
        <Link
          href="/demo?source=tools-linux-drift-risk-result"
          onClick={() =>
            trackToolEvent("tool_demo_cta_clicked", {
              tool: TOOL_SLUG,
              surface: "result_panel",
            })
          }
          className="inline-flex items-center justify-center rounded-md border border-accent-blue/40 bg-accent-blue/5 px-3 py-1.5 text-xs font-medium text-accent-blue hover:bg-accent-blue/10"
        >
          Explore a sample workspace
        </Link>
      </div>
    </div>
  );
}
