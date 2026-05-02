"use client";

import { ErrorState } from "@/components/ui/EmptyState";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry when configured — no-op otherwise
    import("@sentry/nextjs").then(({ captureException }) => captureException(error)).catch(() => {});
  }, [error]);

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
