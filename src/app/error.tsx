"use client";

import { ErrorState } from "@/components/ui/EmptyState";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-start gap-4 px-6 py-10">
      <ErrorState
        title="BLACKGLASS hit an unexpected fault"
        description={
          error.message ||
          "Retry the action — if the fault persists, capture the digest for engineering review."
        }
        retryLabel="Retry render"
        onRetry={reset}
      />
      {error.digest ? (
        <p className="font-mono text-xs text-fg-faint">Digest {error.digest}</p>
      ) : null}
    </div>
  );
}
