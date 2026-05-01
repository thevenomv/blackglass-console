"use client";

import { ErrorState } from "@/components/ui/EmptyState";
import { useRouter } from "next/navigation";

export function FetchFailed({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const router = useRouter();
  return (
    <div className="px-6 py-10">
      <ErrorState
        title={title}
        description={
          description ??
          "The API rejected the request or the network failed. Retry after verifying NEXT_PUBLIC_API_URL and collector availability."
        }
        retryLabel="Reload data"
        onRetry={() => router.refresh()}
      />
    </div>
  );
}
