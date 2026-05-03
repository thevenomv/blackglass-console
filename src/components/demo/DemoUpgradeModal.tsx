"use client";

import Link from "next/link";
import { TrialSignupLink } from "@/components/demo/DemoGateButton";

export function DemoUpgradeModal({
  onClose,
  attemptedAction,
}: {
  onClose: () => void;
  attemptedAction?: string;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-upgrade-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-border-default bg-bg-panel p-6 shadow-elevated"
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-amber-400">
          Sample workspace
        </p>
        <h2 id="demo-upgrade-title" className="mt-2 text-lg font-semibold text-fg-primary">
          Connect real infrastructure in your own workspace
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          You are viewing a <strong className="text-fg-primary">read-only, non-persistent demo</strong>{" "}
          seeded with fictional hosts and findings. Nothing here touches your servers.
          {attemptedAction ? (
            <>
              {" "}
              The action <span className="font-mono text-fg-primary">{attemptedAction}</span> requires
              a real workspace.
            </>
          ) : null}
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-fg-muted">
          <li>14-day trial — no credit card — real scans and saved state</li>
          <li>Trial caps: 10 hosts, 2 paid operator seats (viewers still unlimited after upgrade)</li>
          <li>After trial: read-only visibility until you subscribe</li>
        </ul>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-card border border-border-default px-4 py-2 text-sm font-medium text-fg-muted hover:bg-bg-elevated"
          >
            Keep exploring demo
          </button>
          <Link
            href="/book"
            className="rounded-card border border-border-subtle bg-bg-elevated px-4 py-2 text-center text-sm font-medium text-fg-primary hover:bg-bg-panel"
          >
            Book walkthrough
          </Link>
          <TrialSignupLink className="rounded-card bg-accent-blue px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent-blue-hover">
            Start free trial
          </TrialSignupLink>
        </div>
        <p className="mt-4 text-xs text-fg-faint">
          Already have an account?{" "}
          <Link
            href={
              typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
              process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0
                ? "/sign-in"
                : "/login"
            }
            className="text-accent-blue hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
