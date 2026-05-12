"use client";

/**
 * ContactSalesForm — public lead-intake form for the Enterprise tier.
 *
 * POSTs to /api/contact-sales (see route handler for validation,
 * rate-limiting, audit, Slack + email fan-out). Renders inline
 * success / error states so the prospect doesn't lose context.
 *
 * UX choices worth knowing:
 *   - Honeypot field "website" is visually hidden but a tab-target;
 *     bots tend to fill every <input>, real users skip it.
 *   - Submit button shows pending state and disables itself; double-
 *     submits are common when the form is server-validated.
 *   - On 429 (rate-limited) we surface the retry hint from the API
 *     instead of a generic error — the user wants to know whether to
 *     wait or email instead.
 */

import { useState, type FormEvent } from "react";
import { MARKETING_CONTACT_EMAIL, marketingMailtoHref } from "@/lib/marketing/contact";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

const HOST_BUCKETS = [
  "1–10",
  "11–50",
  "51–250",
  "251–1,000",
  "1,001–10,000",
  "10,001+",
];

const USE_CASE_BUCKETS = [
  "SOC 2 / ISO 27001 evidence",
  "PCI-DSS configuration monitoring",
  "FedRAMP / CMMC controls",
  "Internal change-control program",
  "Incident-response forensics",
  "Other / not sure yet",
];

export function ContactSalesForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ kind: "submitting" });

    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      company: String(fd.get("company") ?? ""),
      hostCount: String(fd.get("hostCount") ?? ""),
      useCase: String(fd.get("useCase") ?? ""),
      message: String(fd.get("message") ?? ""),
      website: String(fd.get("website") ?? ""), // honeypot
    };

    try {
      const res = await fetch("/api/contact-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus({ kind: "ok" });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        detail?: string;
        message?: string;
      };
      setStatus({
        kind: "error",
        message:
          body.detail ?? body.message ?? `Server returned ${res.status}. Please try again or email ${MARKETING_CONTACT_EMAIL}.`,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? `Network error: ${err.message}`
            : "Network error — please try again.",
      });
    }
  };

  if (status.kind === "ok") {
    return (
      <div className="rounded-card border border-success/40 bg-success-soft/30 p-6">
        <h2 className="text-sm font-semibold text-success">Thanks — we got it.</h2>
        <p className="mt-2 text-sm text-fg-muted">
          A human will reply within one business day. If you don&rsquo;t see anything in 48
          hours, please check your spam folder or email{" "}
          <a className="text-accent-blue hover:underline" href={marketingMailtoHref()}>
            {MARKETING_CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
    );
  }

  const isSubmitting = status.kind === "submitting";

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-card border border-border-default bg-bg-panel p-6"
    >
      {/* Honeypot — visually hidden but still focusable for bots that
          scrape every input. tab-index=-1 + aria-hidden keeps real
          keyboard users from accidentally landing on it. */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="cs-website">Website</label>
        <input
          id="cs-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" required>
          <input
            type="text"
            name="name"
            required
            maxLength={200}
            autoComplete="name"
            className={inputClass}
            placeholder="Avery Chen"
          />
        </Field>
        <Field label="Work email" required>
          <input
            type="email"
            name="email"
            required
            maxLength={254}
            autoComplete="email"
            className={inputClass}
            placeholder="avery@acme.io"
          />
        </Field>
      </div>

      <Field label="Company" required>
        <input
          type="text"
          name="company"
          required
          maxLength={200}
          autoComplete="organization"
          className={inputClass}
          placeholder="Your company name"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Approximate fleet size">
          <select name="hostCount" defaultValue="" className={inputClass}>
            <option value="">Choose a range…</option>
            {HOST_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {b} hosts
              </option>
            ))}
          </select>
        </Field>
        <Field label="Primary use case">
          <select name="useCase" defaultValue="" className={inputClass}>
            <option value="">Choose one…</option>
            {USE_CASE_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Anything else we should know?">
        <textarea
          name="message"
          rows={4}
          maxLength={2000}
          className={`${inputClass} resize-y`}
          placeholder="Compliance deadlines, current tooling, cloud accounts to evaluate against — anything that helps us prep."
        />
      </Field>

      {status.kind === "error" ? (
        <div className="rounded-card border border-danger/40 bg-danger-soft/30 px-3 py-2.5 text-xs text-danger">
          {status.message}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-blue-hover disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? "Sending…" : "Send enquiry"}
        </button>
        <p className="text-xs text-fg-faint">
          We&rsquo;ll only use this to reply to you. No marketing emails, ever.
        </p>
      </div>
    </form>
  );
}

const inputClass =
  "block w-full rounded-md border border-border-default bg-bg-input px-3 py-2 text-sm text-fg-primary shadow-sm transition focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1.5 block font-medium text-fg-primary">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      {children}
    </label>
  );
}
