"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function BillingPortalButton({ customerId }: { customerId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function openPortal() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/checkout/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const data = (await res.json()) as { url?: string; message?: string; error?: string };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Could not open billing portal.");
        return;
      }
      if (data.url) window.location.href = data.url;
      else setError("Stripe did not return a portal URL.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" disabled={pending} onClick={() => void openPortal()}>
        {pending ? "Opening…" : "Open Stripe billing portal"}
      </Button>
      {error ? <p className="text-xs text-amber-300">{error}</p> : null}
    </div>
  );
}
