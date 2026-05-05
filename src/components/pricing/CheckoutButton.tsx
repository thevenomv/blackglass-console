"use client";

import Link from "next/link";
import { useState } from "react";

interface CheckoutButtonProps {
  className: string;
  children: React.ReactNode;
  /** SaaS plan code — passed to the checkout API to route to the correct Stripe price. */
  planCode?: string;
}

export default function CheckoutButton({ className, children, planCode }: CheckoutButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setErrorCode(null);
    setErrorDetail(null);
    try {
      const body = planCode ? JSON.stringify({ planCode }) : undefined;
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      let payload: { url?: string; error?: string; detail?: string } = {};
      try {
        payload = (await res.json()) as { url?: string; error?: string; detail?: string };
      } catch {
        setErrorCode("invalid_response");
        setErrorDetail(`Server returned ${res.status} with a non-JSON body.`);
        setStatus("error");
        return;
      }
      if (!res.ok) {
        setErrorCode(payload.error ?? "request_failed");
        setErrorDetail(payload.detail ?? `Server returned ${res.status}`);
        setStatus("error");
        return;
      }
      if (!payload.url) {
        setErrorCode("no_url");
        setErrorDetail("Checkout did not return a redirect URL.");
        setStatus("error");
        return;
      }
      window.location.href = payload.url;
    } catch {
      setErrorCode("network");
      setErrorDetail("Could not reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  return (
    <div className="w-full space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        aria-busy={status === "loading"}
        className={className}
      >
        {status === "loading"
          ? "Redirecting to checkout…"
          : status === "error"
            ? "Try again — or use options below"
            : children}
      </button>
      {status === "error" && errorDetail ? (
        <p className="text-center text-xs text-fg-muted">
          {errorDetail}
          {errorCode === "billing_unavailable" ? (
            <>
              {" "}
              <Link href="/book" className="font-medium text-accent-blue hover:underline">
                Book a walkthrough
              </Link>{" "}
              ·{" "}
              <a href="mailto:jamie@obsidiandynamics.co.uk?subject=BLACKGLASS%20billing" className="font-medium text-accent-blue hover:underline">
                Email billing
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
