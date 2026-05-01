export function KpiCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel: string;
}) {
  return (
    <div className="rounded-card border border-border-default bg-bg-panel px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
        {label}
      </p>
      <p className="mt-1 tabular-nums text-[28px] font-semibold leading-none text-fg-primary">
        {value}
      </p>
      <p className="mt-2 text-xs text-fg-muted">{sublabel}</p>
    </div>
  );
}
