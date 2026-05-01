export function KpiCard({
  label,
  value,
  sublabel,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sublabel: string;
  tone?: "default" | "risk" | "positive";
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
    </div>
  );
}
