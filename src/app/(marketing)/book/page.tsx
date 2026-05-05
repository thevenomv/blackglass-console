import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book a walkthrough | BLACKGLASS",
  description: "Schedule a walkthrough of BLACKGLASS for your team.",
};

export default function BookWalkthroughPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-fg-muted">
      <h1 className="text-2xl font-semibold text-fg-primary">Book a walkthrough</h1>
      <p className="mt-4 text-sm leading-relaxed">
        Pick a time that works for you.
      </p>
      <a
        href="https://calendar.app.google/Yi9abUYJafS8TobX8"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-block rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
      >
        Schedule a time
      </a>
    </main>
  );
}
