"use client";

import Link from "next/link";
import { useState } from "react";
import { marketingMailtoHref } from "@/lib/marketing/contact";

interface CheckoutButtonProps {
  className: string;
  children: React.ReactNode;
  /** SaaS plan code — passed to the checkout API to route to the correct Stripe price. */
  planCode?: string;
  /** "monthly" (default) or "annual" — selects the matching Stripe price. */
  billingCycle?: "monthly" | "annual";
  /**
   * Add-on codes to bundle into the same Stripe subscription as the
   * base plan ("remediator", "charon"). Passing
   * an add-on means the customer pays one combined invoice instead
   * of going through a second checkout. Ignored values are silently
   * dropped server-side, so a stale frontend can't break checkout.
   */
  addons?: ReadonlyArray<"remediator" | "charon">;
}

export default function CheckoutButton({
  className,
  children,
  planCode,
  billingCycle,
  addons,
}: CheckoutButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setErrorCode(null);
    setErrorDetail(null);
    try {
      const reqPayload: Record<string, unknown> = {};
      if (planCode) reqPayload.planCode = planCode;
      if (billingCycle) reqPayload.billingCycle = billingCycle;
      if (addons && addons.length > 0) reqPayload.addons = addons;
      const body =
        Object.keys(reqPayload).length > 0 ? JSON.stringify(reqPayload) : undefined;
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
              <a href={marketingMailtoHref("Blackglass billing")} className="font-medium text-accent-blue hover:underline">
                Email billing
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
