import type { Metadata } from "next";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";

export const metadata: Metadata = {
  title: "Book a walkthrough | BLACKGLASS",
  description: "Schedule a walkthrough of BLACKGLASS for your team.",
};

export default function BookWalkthroughPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-fg-muted">
        <h1 className="text-2xl font-semibold text-fg-primary">Book a walkthrough</h1>
        <p className="mt-4 text-sm leading-relaxed">
          We will walk through baseline capture, drift triage, and evidence export using your target
          scenarios. Replace the email below with your scheduling link or embed when ready.
        </p>
        <a
          href="mailto:jamie@obsidiandynamics.co.uk?subject=BLACKGLASS%20walkthrough%20request"
          className="mt-8 inline-block rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
        >
          Email jamie@obsidiandynamics.co.uk
        </a>
        <p className="mt-6 text-sm">
          Prefer to self-serve first?{" "}
          <TrialSignupLink className="font-medium text-accent-blue hover:underline">
            Start free trial
          </TrialSignupLink>{" "}
          or{" "}
          <a href="/demo" className="font-medium text-accent-blue hover:underline">
            explore the demo
          </a>
          .
        </p>
    </main>
  );
}
