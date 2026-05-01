"use client";

import { ErrorState } from "@/components/ui/EmptyState";
import Link from "next/link";

export default function DriftRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[30vh] flex-col items-start gap-4 px-6 py-8">
      <ErrorState
        title="Drift view failed"
        description={
          error.message || "The drift queue could not be loaded. You can retry or return home."
        }
        retryLabel="Retry"
        onRetry={reset}
      />
      <Link href="/" className="text-sm font-medium text-accent-blue hover:underline">
        Back to dashboard
      </Link>
      {error.digest ? (
        <p className="font-mono text-xs text-fg-faint">Digest {error.digest}</p>
      ) : null}
    </div>
  );
}
