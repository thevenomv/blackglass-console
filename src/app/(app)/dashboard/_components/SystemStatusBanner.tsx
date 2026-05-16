import type { ReactNode } from "react";

/**
 * One issue surfaced on the fleet dashboard. The dashboard previously
 * stacked five separate banners (collector missing, baseline storage not
 * configured, baseline path read-only, no hosts onboarded, attention
 * summary). When two or three were active at once, the operator had to
 * scroll past a wall of yellow/blue boxes before reaching KPIs.
 *
 * `SystemStatusBanner` collapses that into a single banner: the
 * highest-priority issue is shown verbatim, anything else is tucked into
 * a "+N more" disclosure so it stays one click away without dominating
 * the layout.
 */
export type SystemStatusItem = {
  /** Higher number = more urgent. The largest value wins as the lead item. */
  severity: "danger" | "warning" | "info";
  /** Stable id for keying. */
  id: string;
  title: string;
  /** Body copy. Plain text or rich nodes (links, etc). */
  detail: ReactNode;
};

const SEVERITY_RANK: Record<SystemStatusItem["severity"], number> = {
  danger: 3,
  warning: 2,
  info: 1,
};

const TONE_CLASSES: Record<SystemStatusItem["severity"], string> = {
  danger: "border-danger/45 bg-danger-soft/30",
  warning: "border-warning/45 bg-warning-soft/25",
  info: "border-accent-blue/35 bg-accent-blue-soft/20",
};

const TITLE_TONE: Record<SystemStatusItem["severity"], string> = {
  danger: "text-danger",
  warning: "text-fg-primary",
  info: "text-fg-primary",
};

/**
 * Render the single highest-priority issue as the lead and any additional
 * issues inside a collapsed `<details>` disclosure. Renders nothing when
 * `items` is empty so callers don't need to gate on length themselves.
 */
export function SystemStatusBanner({ items }: { items: SystemStatusItem[] }) {
  if (items.length === 0) return null;

  // Sort by severity rank descending; ties keep the input order so callers
  // can express secondary preference (e.g. "if both warnings fire, show
  // the collector one first").
  const sorted = [...items].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  // `items.length > 0` guaranteed by the early return above, so `sorted[0]` is defined.
  const lead = sorted[0]!;
  const rest = sorted.slice(1);

  return (
    <section
      role="region"
      aria-label="System status"
      className={`rounded-card border px-4 py-3 text-sm ${TONE_CLASSES[lead.severity]}`}
    >
      <p className={`font-semibold ${TITLE_TONE[lead.severity]}`}>{lead.title}</p>
      <div className="mt-1 text-fg-muted">{lead.detail}</div>

      {rest.length > 0 ? (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-fg-muted transition-colors hover:text-fg-primary">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>{" "}
            {rest.length} other system status item{rest.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-2 border-t border-border-subtle/50 pt-2">
            {rest.map((item) => (
              <li key={item.id} className="text-sm">
                <p className={`font-medium ${TITLE_TONE[item.severity]}`}>{item.title}</p>
                <div className="mt-0.5 text-fg-muted">{item.detail}</div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
