"use client";

import { useState } from "react";

interface Props {
  customerId: string;
}

export default function BillingPortalButton({ customerId }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleClick() {
    setStatus("loading");
    try {
      const res = await fetch("/api/checkout/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      aria-busy={status === "loading"}
      className="block w-full rounded-card border border-border-default bg-bg-elevated py-2.5 text-center text-sm font-semibold text-fg-muted transition-colors hover:border-border-strong hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel disabled:opacity-60"
    >
      {status === "loading"
        ? "Opening billing portal…"
        : status === "error"
        ? "Could not open portal — try again"
        : "Manage billing & invoices"}
    </button>
  );
}
