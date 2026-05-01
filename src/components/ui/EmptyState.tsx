import type { ReactNode } from "react";
import { Button } from "./Button";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start rounded-card border border-dashed border-border-default bg-bg-panel/40 px-8 py-12">
      <p className="text-sm font-semibold text-fg-primary">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  retryLabel = "Retry",
  onRetry,
}: {
  title: string;
  description: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger/40 bg-danger-soft/40 px-6 py-5"
    >
      <p className="text-sm font-semibold text-danger">{title}</p>
      <p className="mt-2 text-sm text-fg-muted">{description}</p>
      {onRetry ? (
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
