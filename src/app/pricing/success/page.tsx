import Link from "next/link";
import { stripe } from "@/lib/stripe";
import BillingPortalButton from "@/components/pricing/BillingPortalButton";

export const metadata = {
  title: "Subscription confirmed — BLACKGLASS by Obsidian Dynamics",
};

interface Props {
  searchParams: Promise<{ session_id?: string }>;
}

async function getSessionData(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });
    const customer =
      session.customer && typeof session.customer !== "string"
        ? session.customer
        : null;
    const sub =
      session.subscription && typeof session.subscription !== "string"
        ? session.subscription
        : null;
    return {
      email: customer && "email" in customer ? (customer.email ?? null) : null,
      customerId: customer?.id ?? null,
      invoiceUrl:
        sub && "latest_invoice" in sub && sub.latest_invoice &&
        typeof sub.latest_invoice !== "string" &&
        "hosted_invoice_url" in sub.latest_invoice
          ? (sub.latest_invoice.hosted_invoice_url ?? null)
          : null,
      invoicePdf:
        sub && "latest_invoice" in sub && sub.latest_invoice &&
        typeof sub.latest_invoice !== "string" &&
        "invoice_pdf" in sub.latest_invoice
          ? (sub.latest_invoice.invoice_pdf ?? null)
          : null,
    };
  } catch {
    return null;
  }
}

export default async function PricingSuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  const sessionData = session_id ? await getSessionData(session_id) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6 py-20">
      <div className="w-full max-w-md rounded-card border border-border-default bg-bg-panel p-10 text-center">
        {/* Icon */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
          <svg
            aria-hidden="true"
            className="h-7 w-7 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-fg-primary">
          You&rsquo;re on Team
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Your BLACKGLASS Team subscription is active.
          {sessionData?.email ? (
            <> A receipt has been sent to <strong>{sessionData.email}</strong>.</>
          ) : (
            <> A receipt will be sent to your billing email.</>
          )}
        </p>

        {/* Invoice / receipt links */}
        {(sessionData?.invoiceUrl || sessionData?.invoicePdf) && (
          <div className="mt-6 flex flex-col gap-2 rounded-card border border-border-default bg-bg-elevated p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-faint">Invoice</p>
            <div className="flex gap-3">
              {sessionData.invoiceUrl && (
                <a
                  href={sessionData.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-accent-blue hover:underline"
                >
                  View invoice
                </a>
              )}
              {sessionData.invoicePdf && (
                <a
                  href={sessionData.invoicePdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-fg-muted hover:text-fg-primary hover:underline"
                >
                  Download PDF
                </a>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/"
            className="block w-full rounded-card bg-accent-blue py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel"
          >
            Go to console
          </Link>
          <Link
            href="/hosts"
            className="block w-full rounded-card border border-border-default bg-bg-elevated py-2.5 text-center text-sm font-semibold text-fg-primary transition-colors hover:border-accent-blue hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel"
          >
            Add your first host
          </Link>
          {sessionData?.customerId && (
            <BillingPortalButton customerId={sessionData.customerId} />
          )}
        </div>

        <p className="mt-6 text-xs text-fg-faint">
          Manage your subscription, payment method, and past invoices at any time via the billing portal.
        </p>
      </div>
    </main>
  );
}

