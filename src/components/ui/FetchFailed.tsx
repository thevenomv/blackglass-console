"use client";

import { ErrorState } from "@/components/ui/EmptyState";
import { useRouter } from "next/navigation";

export function FetchFailed({
  title,
  description,
  hints,
}: {
  title: string;
  description?: string;
  hints?: string;
}) {
  const router = useRouter();
  const detail =
    description ??
    "The API rejected the request or the network failed. This is not the same as “healthy fleet”: verify collectors, auth, and NEXT_PUBLIC_APP_URL before assuming zero drift.";
  return (
    <div className="px-6 py-10">
      <ErrorState
        title={title}
        description={detail}
        retryLabel="Reload data"
        onRetry={() => router.refresh()}
      />
      {hints ? (
        <p className="mt-4 max-w-xl text-sm text-fg-muted">{hints}</p>
      ) : (
        <ul className="mt-4 max-w-xl list-disc space-y-1 pl-5 text-sm text-fg-muted">
          <li>Confirm NEXT_PUBLIC_USE_MOCK=false only when /api/v1 is reachable from SSR.</li>
          <li>Set NEXT_PUBLIC_APP_URL to the deployed HTTPS origin (includes port in dev).</li>
          <li>Check DigitalOcean build logs if this appeared right after deploy.</li>
        </ul>
      )}
    </div>
  );
}
