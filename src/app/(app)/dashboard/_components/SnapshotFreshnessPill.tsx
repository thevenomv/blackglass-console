"use client";

/**
 * SnapshotFreshnessPill
 *
 * Tiny inline indicator shown next to the "Run scan" button so users
 * know exactly how stale (or fresh) the data backing the next scan is.
 *
 * Why this exists
 * ---------------
 * For hosts BLACKGLASS reaches via SSH the data is "live" by the time
 * the scan resolves. For hosts that fall back to the push-agent
 * snapshot cache (DigitalOcean App Platform → Droplet, NAT, air-gap),
 * the freshness ceiling is the agent's push interval (60 seconds).
 * Before this pill existed, users introduced drift on a demo VM,
 * clicked "Run scan" within the push cycle, saw "100% baseline
 * alignment", and concluded drift detection was broken — when in
 * reality the agent simply hadn't pushed yet. Surfacing the snapshot
 * age makes that situation legible without anyone needing to read the
 * docs.
 *
 * Behaviour
 * ---------
 *  - Re-renders every 5s so the "23s ago" label stays accurate
 *    without a server round-trip.
 *  - Tone shifts (fresh → stale → cold) at well-defined thresholds
 *    so a glance is enough.
 *  - Renders nothing when no signal has ever been received (the
 *    onboarding card already covers that case).
 */

import { useEffect, useState } from "react";

type Props = {
  /** ISO timestamp of the most recent signal we have for any host in the fleet. */
  latestSignalAt: string | null;
};

/** Tone thresholds — chosen against the 60s default agent push interval. */
const FRESH_SECONDS = 90;     // <= 90s → green
const STALE_SECONDS = 5 * 60; // <= 5min → amber, beyond → red

function describe(ageSeconds: number): { label: string; cls: string; title: string } {
  let label: string;
  if (ageSeconds < 60) label = `${ageSeconds}s ago`;
  else if (ageSeconds < 3600) label = `${Math.round(ageSeconds / 60)}m ago`;
  else if (ageSeconds < 86400) label = `${Math.round(ageSeconds / 3600)}h ago`;
  else label = `${Math.round(ageSeconds / 86400)}d ago`;

  if (ageSeconds <= FRESH_SECONDS) {
    return {
      label,
      cls: "border-success/45 bg-success-soft/35 text-success",
      title: "Latest snapshot is fresh — Run scan will use up-to-date data.",
    };
  }
  if (ageSeconds <= STALE_SECONDS) {
    return {
      label,
      cls: "border-warning/45 bg-warning-soft/30 text-warning",
      title:
        "Latest snapshot is older than the 60-second push interval. Run scan will wait briefly for a fresh push when SSH is unavailable.",
    };
  }
  return {
    label,
    cls: "border-danger/45 bg-danger-soft/30 text-danger",
    title:
      "No fresh snapshot in over 5 minutes — the agent may be stopped or unable to reach Blackglass. Check the host's blackglass-agent.timer status.",
  };
}

export function SnapshotFreshnessPill({ latestSignalAt }: Props) {
  const [now, setNow] = useState<number | null>(null);

  // Tick every 5s on the client so the relative-time label stays
  // accurate without a re-fetch. Initialising on mount avoids
  // SSR-vs-client hydration mismatch on the timestamp string.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setNow(Date.now());
    });
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  if (!latestSignalAt) return null;
  if (now === null) return null;

  const t = Date.parse(latestSignalAt);
  if (!Number.isFinite(t)) return null;

  const ageSeconds = Math.max(0, Math.round((now - t) / 1000));
  const { label, cls, title } = describe(ageSeconds);

  return (
    <a
      // Linking the pill to the freshness docs gives operators a one-
      // click answer to "why is this amber?" without us building an
      // in-app explainer popover. The visual treatment stays the
      // same — anchor wrapper inherits cursor:pointer for free.
      href="/docs/snapshot-freshness"
      title={`${title} (click to learn how this works)`}
      aria-label={`Latest snapshot ${label}. Click to read about the snapshot freshness model.`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:opacity-90 ${cls}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80"
      />
      Snapshot {label}
    </a>
  );
}
