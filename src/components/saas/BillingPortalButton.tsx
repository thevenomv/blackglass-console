"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Opens the Stripe Customer Portal for the current tenant.
 *
 * Hits the no-arg /api/billing/portal route — the server resolves the Stripe
 * customer id from the authenticated tenant subscription, so the client
 * never has to know (or be able to forge) the customer id.
 *
 * The legacy `customerId` prop is accepted for backwards compatibility with
 * existing call sites; it's no longer required and ignored when set.
 */
export function BillingPortalButton({ customerId: _customerId }: { customerId?: string } = {}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function openPortal() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
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
