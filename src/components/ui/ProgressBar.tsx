export function ProgressRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-fg-muted">{label}</span>
        <span className="tabular-nums text-xs text-fg-faint">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-[4px] bg-track">
        <div
          className="h-2 rounded-[4px] bg-accent-blue/90 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
