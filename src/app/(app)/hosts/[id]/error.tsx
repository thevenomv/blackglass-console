"use client";

import { ErrorState } from "@/components/ui/EmptyState";
import Link from "next/link";

export default function HostDetailRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[30vh] flex-col items-start gap-4 px-6 py-8">
      <ErrorState
        title="Host detail failed"
        description={
          error.message ||
          "This host could not be loaded. Retry or pick another host from the fleet list."
        }
        retryLabel="Retry"
        onRetry={reset}
      />
      <Link href="/hosts" className="text-sm font-medium text-accent-blue hover:underline">
        All hosts
      </Link>
      {error.digest ? (
        <p className="font-mono text-xs text-fg-faint">Digest {error.digest}</p>
      ) : null}
    </div>
  );
}
