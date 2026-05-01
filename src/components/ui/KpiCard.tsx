export function KpiCard({
  label,
  value,
  sublabel,
  tone = "default",
  delta,
}: {
  label: string;
  value: string | number;
  sublabel: string;
  tone?: "default" | "risk" | "positive";
  /** Optional period-over-period trend. positive=true renders green ▲, false renders red ▼. */
  delta?: { label: string; positive: boolean };
}) {
  const shell =
    tone === "risk"
      ? "border-danger/35 bg-danger-soft/35"
      : tone === "positive"
        ? "border-success/35 bg-success-soft/35"
        : "border-border-default bg-bg-panel";

  const valueTone =
    tone === "risk" ? "text-danger" : tone === "positive" ? "text-success" : "text-fg-primary";

  return (
    <div className={`rounded-card border px-5 py-4 ${shell}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">{label}</p>
      <p className={`mt-1 tabular-nums text-[28px] font-semibold leading-none ${valueTone}`}>
        {value}
      </p>
      <p className="mt-2 text-xs text-fg-muted">{sublabel}</p>
      {delta ? (
        <p
          className={`mt-1.5 text-xs font-medium tabular-nums ${
            delta.positive ? "text-success" : "text-danger"
          }`}
        >
          {delta.positive ? "▲" : "▼"} {delta.label}
        </p>
      ) : null}
    </div>
  );
}
