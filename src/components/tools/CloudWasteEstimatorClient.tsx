"use client";

/**
 * Cloud Waste Estimator — interactive form + result panel.
 *
 * All maths is delegated to `src/lib/tools/cloud-waste/estimator.ts`. The
 * component itself only handles state, accessibility, and presentation.
 *
 * UX choices worth noting:
 *   - The form is split per-provider so the user can compare DO / AWS / GCP
 *     mental models without confusing them.
 *   - Recompute happens live (no submit button) — every input change runs
 *     the (cheap) deterministic estimator.
 *   - The "email me this" path is intentionally optional and ships ONLY
 *     the same numbers the user already sees on screen — no infra IDs.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  buildChecklist,
  classifyRiskBand,
  emptyProviderInput,
  estimateCloudWaste,
  formatRangeUsd,
  INSTANCE_SIZE_LABELS,
  PROVIDER_LABELS,
  type EstimateResult,
  type InstanceSize,
  type Provider,
  type ProviderInput,
} from "@/lib/tools/cloud-waste/estimator";
import { trackToolEvent } from "@/lib/tools/analytics";

const TOOL_SLUG = "cloud-waste-estimator";

const ALL_PROVIDERS: Provider[] = ["do", "aws", "gcp"];
const ALL_SIZES: InstanceSize[] = ["small", "medium", "large"];

interface FormState {
  selected: Set<Provider>;
  byProvider: Record<Provider, ProviderInput>;
}

function initialFormState(): FormState {
  return {
    selected: new Set<Provider>(["do"]),
    byProvider: {
      do: emptyProviderInput("do"),
      aws: emptyProviderInput("aws"),
      gcp: emptyProviderInput("gcp"),
    },
  };
}

export function CloudWasteEstimatorClient() {
  const [state, setState] = useState<FormState>(initialFormState);

  // Fire one `tool_estimator_opened` per session-mount, then debounce
  // recompute events so a slider drag doesn't flood the dataLayer.
  const openedFiredRef = useRef(false);
  const recomputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (openedFiredRef.current) return;
    openedFiredRef.current = true;
    trackToolEvent("tool_estimator_opened", { tool: TOOL_SLUG });
  }, []);

  const result = useMemo<EstimateResult>(() => {
    const providers = Array.from(state.selected).map(
      (p) => state.byProvider[p],
    );
    return estimateCloudWaste({ providers });
  }, [state]);

  // Debounced recompute event — fires ~750ms after the last input change so
  // a slider drag emits one event, not 100. Skip if the result is still empty
  // (no signal worth recording).
  useEffect(() => {
    if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
    if (result.total.point <= 0) return;
    recomputeTimerRef.current = setTimeout(() => {
      trackToolEvent("tool_estimator_recomputed", {
        tool: TOOL_SLUG,
        risk_band: result.riskBand,
        providers: Array.from(state.selected).join(","),
      });
    }, 750);
    return () => {
      if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
    };
  }, [result, state.selected]);

  const toggleProvider = (provider: Provider) => {
    setState((prev) => {
      const next = new Set(prev.selected);
      if (next.has(provider)) {
        // Don't let the user deselect the only remaining provider — the
        // estimator becomes meaningless with zero providers and the empty
        // state confuses people who just clicked it by accident.
        if (next.size === 1) return prev;
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return { ...prev, selected: next };
    });
  };

  const updateProvider = (provider: Provider, patch: Partial<ProviderInput>) => {
    setState((prev) => ({
      ...prev,
      byProvider: {
        ...prev.byProvider,
        [provider]: {
          ...prev.byProvider[provider],
          ...patch,
        },
      },
    }));
  };

  const reset = () => setState(initialFormState());

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section
        aria-label="Estimator inputs"
        className="space-y-6 rounded-card border border-border-default bg-bg-panel p-6"
      >
        <ProviderPicker selected={state.selected} onToggle={toggleProvider} />

        <div className="space-y-6">
          {Array.from(state.selected).map((provider) => (
            <ProviderInputs
              key={provider}
              input={state.byProvider[provider]}
              onChange={(patch) => updateProvider(provider, patch)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle pt-4">
          <p className="text-xs text-fg-faint">
            Numbers update as you type. Nothing leaves your browser.
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

      <section aria-label="Estimate results" className="space-y-5">
        <ResultSummary result={result} />
        <CategoryBreakdown result={result} />
        <RecommendationPanel result={result} />
        <ChecklistAndEmail result={result} state={state} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form blocks
// ---------------------------------------------------------------------------

function ProviderPicker({
  selected,
  onToggle,
}: {
  selected: Set<Provider>;
  onToggle: (p: Provider) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-fg-primary">Which providers?</legend>
      <p className="mt-1 text-xs text-fg-faint">
        Pick one or more. We&rsquo;ll add a section per provider below.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ALL_PROVIDERS.map((p) => {
          const active = selected.has(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(p)}
              className={
                active
                  ? "rounded-md border border-accent-blue bg-accent-blue-soft px-3 py-1.5 text-sm font-medium text-accent-blue"
                  : "rounded-md border border-border-default bg-bg-base px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
              }
            >
              {PROVIDER_LABELS[p]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ProviderInputs({
  input,
  onChange,
}: {
  input: ProviderInput;
  onChange: (patch: Partial<ProviderInput>) => void;
}) {
  const idle = input.idlePercent;
  return (
    <div className="rounded-card border border-border-subtle bg-bg-base p-5">
      <h3 className="text-sm font-semibold text-fg-primary">
        {PROVIDER_LABELS[input.provider]}
      </h3>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">
          Running instances
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {ALL_SIZES.map((size) => (
            <NumberField
              key={size}
              label={INSTANCE_SIZE_LABELS[size]}
              value={input.instances[size]}
              min={0}
              onChange={(v) =>
                onChange({
                  instances: { ...input.instances, [size]: v },
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="mt-5">
        <SliderField
          label="Approximate % you believe are idle"
          value={idle}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(v) => onChange({ idlePercent: v })}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Volumes attached to instances"
          value={input.attachedVolumes}
          min={0}
          onChange={(v) => onChange({ attachedVolumes: v })}
        />
        <NumberField
          label="Volumes not attached to anything"
          value={input.unattachedVolumes}
          min={0}
          onChange={(v) => onChange({ unattachedVolumes: v })}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Snapshots older than 30 days"
          value={input.snapshotsOlder30d}
          min={0}
          onChange={(v) => onChange({ snapshotsOlder30d: v })}
        />
        <NumberField
          label="Snapshots older than 90 days"
          value={input.snapshotsOlder90d}
          min={0}
          onChange={(v) => onChange({ snapshotsOlder90d: v })}
        />
      </div>

      <details className="mt-4 text-xs text-fg-muted">
        <summary className="cursor-pointer text-fg-faint hover:text-fg-primary">
          Override default monthly costs (optional)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {ALL_SIZES.map((size) => (
            <NumberField
              key={size}
              label={`${INSTANCE_SIZE_LABELS[size]} $/mo`}
              value={input.costOverrides?.instance?.[size] ?? ""}
              min={0}
              step="any"
              placeholder="Use default"
              onChange={(v) =>
                onChange({
                  costOverrides: {
                    ...input.costOverrides,
                    instance: {
                      ...((input.costOverrides?.instance) ?? ({} as Record<InstanceSize, number>)),
                      [size]: v,
                    },
                  },
                })
              }
            />
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <NumberField
            label="$/GB-month for volumes"
            value={input.costOverrides?.volumePerGbMonth ?? ""}
            min={0}
            step="any"
            placeholder="Use default"
            onChange={(v) =>
              onChange({
                costOverrides: {
                  ...input.costOverrides,
                  volumePerGbMonth: v,
                },
              })
            }
          />
          <NumberField
            label="$/GB-month for snapshots"
            value={input.costOverrides?.snapshotPerGbMonth ?? ""}
            min={0}
            step="any"
            placeholder="Use default"
            onChange={(v) =>
              onChange({
                costOverrides: {
                  ...input.costOverrides,
                  snapshotPerGbMonth: v,
                },
              })
            }
          />
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result blocks
// ---------------------------------------------------------------------------

function ResultSummary({ result }: { result: EstimateResult }) {
  const band = result.riskBand;
  return (
    <div className="rounded-card border border-border-default bg-bg-panel p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">
        Estimated monthly waste
      </p>
      <p className="mt-1 text-2xl font-semibold text-fg-primary">
        {formatRangeUsd(result.total.range)}
      </p>
      <p className="mt-1 text-xs text-fg-muted">{result.total.rationale}</p>

      <div className="mt-4 flex items-center gap-3">
        <RiskBandPill band={band} />
        <p className="text-xs text-fg-muted">{riskBandSummary(band)}</p>
      </div>
    </div>
  );
}

function RiskBandPill({ band }: { band: ReturnType<typeof classifyRiskBand> }) {
  if (band === "high") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-soft/40 px-2.5 py-0.5 text-xs font-medium text-danger">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
        High
      </span>
    );
  }
  if (band === "medium") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft/40 px-2.5 py-0.5 text-xs font-medium text-warning">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
        Medium
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft/40 px-2.5 py-0.5 text-xs font-medium text-success">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
      Low
    </span>
  );
}

function riskBandSummary(band: ReturnType<typeof classifyRiskBand>): string {
  if (band === "high") {
    return "Worth a focused cleanup sprint and ongoing automation.";
  }
  if (band === "medium") {
    return "Recoverable in a focused afternoon — schedule a sweep this month.";
  }
  return "Healthy. Keep tagging discipline so it stays that way.";
}

function CategoryBreakdown({ result }: { result: EstimateResult }) {
  const rows = [
    { key: "idleCompute", label: "Idle compute", entry: result.breakdown.idleCompute },
    { key: "orphanedVolumes", label: "Orphaned volumes", entry: result.breakdown.orphanedVolumes },
    { key: "oldSnapshots", label: "Old snapshots", entry: result.breakdown.oldSnapshots },
  ] as const;
  return (
    <div className="rounded-card border border-border-default bg-bg-panel p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">
        Breakdown
      </p>
      <ul className="mt-3 space-y-3 text-sm">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-fg-primary">{row.label}</span>
              <span className="font-mono text-xs text-fg-muted">
                {formatRangeUsd(row.entry.range)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-fg-faint">
              {row.entry.rationale}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecommendationPanel({ result }: { result: EstimateResult }) {
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
          href="/product#charon"
          onClick={() =>
            trackToolEvent("tool_charon_cta_clicked", {
              tool: TOOL_SLUG,
              surface: "result_panel",
            })
          }
          className="inline-flex items-center justify-center rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-blue-hover"
        >
          See how Charon automates this →
        </Link>
        <Link
          href="/demo?source=tools-cloud-waste-estimator"
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
        <Link
          href="/pricing"
          onClick={() =>
            trackToolEvent("tool_pricing_cta_clicked", {
              tool: TOOL_SLUG,
              surface: "result_panel",
            })
          }
          className="inline-flex items-center justify-center rounded-md border border-border-default bg-bg-base px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
        >
          View pricing
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checklist + email gate
// ---------------------------------------------------------------------------

function ChecklistAndEmail({
  result,
  state,
}: {
  result: EstimateResult;
  state: FormState;
}) {
  const downloadChecklist = () => {
    const text = buildChecklist(result);
    if (typeof window === "undefined") return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "blackglass-cloud-waste-checklist.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    trackToolEvent("tool_checklist_downloaded", {
      tool: TOOL_SLUG,
      risk_band: result.riskBand,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-border-default bg-bg-panel p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">
          Take it with you
        </p>
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">
          Download a plain-text checklist tailored to this estimate. Useful for
          handing to whoever will run the actual cleanup.
        </p>
        <button
          type="button"
          onClick={downloadChecklist}
          className="mt-3 inline-flex items-center justify-center rounded-md border border-border-default bg-bg-base px-3 py-1.5 text-xs font-medium text-fg-primary hover:bg-bg-elevated"
        >
          Download checklist (.txt)
        </button>
      </div>

      <EmailReportForm result={result} state={state} />
    </div>
  );
}

interface EmailFormStatus {
  kind: "idle" | "submitting" | "ok" | "error";
  message?: string;
}

function EmailReportForm({
  result,
  state,
}: {
  result: EstimateResult;
  state: FormState;
}) {
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [status, setStatus] = useState<EmailFormStatus>({ kind: "idle" });
  const honeypotId = useId();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status.kind === "submitting") return;

    setStatus({ kind: "submitting" });

    const fd = new FormData(e.currentTarget);
    const honeypot = String(fd.get("website") ?? "");
    // Same honeypot pattern as ContactSalesForm — succeed silently for
    // bots so they stop retrying.
    if (honeypot.trim().length > 0) {
      setStatus({ kind: "ok" });
      return;
    }

    try {
      const res = await fetch("/api/tools/cloud-waste-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          org,
          providers: Array.from(state.selected),
          totals: {
            point: Math.round(result.total.point),
            low: Math.round(result.total.range.low),
            high: Math.round(result.total.range.high),
          },
          riskBand: result.riskBand,
        }),
      });
      if (res.ok) {
        setStatus({ kind: "ok" });
        trackToolEvent("tool_email_submitted", {
          tool: TOOL_SLUG,
          risk_band: result.riskBand,
        });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        detail?: string;
        message?: string;
      };
      setStatus({
        kind: "error",
        message:
          body.detail ?? body.message ?? `Server returned ${res.status}.`,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? `Network error: ${err.message}`
            : "Network error — please try again.",
      });
    }
  };

  if (status.kind === "ok") {
    return (
      <div className="rounded-card border border-success/30 bg-success-soft/30 p-5">
        <p className="text-sm font-semibold text-success">Sent.</p>
        <p className="mt-1 text-xs text-fg-muted">
          If we have email configured for this environment, it&rsquo;ll arrive within a minute.
          Otherwise, the request was logged for follow-up.
        </p>
      </div>
    );
  }

  const isSubmitting = status.kind === "submitting";

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-border-default bg-bg-panel p-5"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-fg-faint">
        Email me this report
      </p>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        Optional. We&rsquo;ll send the same numbers you see here plus the cleanup checklist.
        We don&rsquo;t share your email, and we never collect resource IDs.
      </p>

      {/* Honeypot — visually hidden but a tab-target for bots. */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor={honeypotId}>Website</label>
        <input
          id={honeypotId}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="mt-3 grid gap-3">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-fg-primary">Email</span>
          <input
            type="email"
            name="email"
            required
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary shadow-sm focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
            placeholder="you@company.com"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-fg-primary">
            Org name <span className="text-fg-faint">(optional)</span>
          </span>
          <input
            type="text"
            name="org"
            maxLength={200}
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            className="block w-full rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary shadow-sm focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
            placeholder="Acme"
          />
        </label>
      </div>

      {status.kind === "error" ? (
        <p className="mt-3 rounded-md border border-danger/40 bg-danger-soft/30 px-3 py-2 text-xs text-danger">
          {status.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || email.trim().length === 0}
          className="inline-flex items-center justify-center rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-blue-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Sending…" : "Email me the report"}
        </button>
        <p className="text-[11px] leading-tight text-fg-faint">
          We never log resource IDs or credentials — just the totals you see here.
        </p>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Small inputs
// ---------------------------------------------------------------------------

function NumberField({
  label,
  value,
  min,
  step,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | "";
  min?: number;
  step?: number | "any";
  placeholder?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-fg-primary">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(0);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="block w-full rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary shadow-sm focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
      />
    </label>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 flex items-center justify-between text-fg-primary">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-fg-muted">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="block w-full accent-accent-blue"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
      />
    </label>
  );
}
