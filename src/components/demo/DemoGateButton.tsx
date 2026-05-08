"use client";

import Link from "next/link";
import { useDemoWorkspace } from "@/components/demo/DemoWorkspaceContext";

export function DemoGateButton({
  children,
  actionLabel,
  className = "inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-card border border-border-default bg-bg-panel px-4 py-2 text-sm font-medium text-fg-primary transition-colors hover:bg-bg-elevated",
}: {
  children: React.ReactNode;
  actionLabel: string;
  className?: string;
}) {
  const { requestRealAction } = useDemoWorkspace();
  return (
    <button type="button" className={className} onClick={() => requestRealAction(actionLabel)}>
      {children}
    </button>
  );
}

export function TrialSignupLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const href =
    typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0
      ? "/sign-up"
      : "/login";
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/**
 * "Launch Sandbox" CTA — takes the user to sign-up with a `?sandbox=1` query
 * parameter so the dashboard can auto-trigger sandbox provisioning on first load.
 */
export function LaunchSandboxLink({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const clerkOn =
    typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0;
  const href = clerkOn ? "/sign-up?sandbox=1" : "/login?sandbox=1";
  return (
    <Link href={href} className={className}>
      {children ?? "Launch live sandbox"}
    </Link>
  );
}
