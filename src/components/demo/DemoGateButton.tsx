"use client";

import Link from "next/link";
import { useDemoWorkspace } from "@/components/demo/DemoWorkspaceContext";

export function DemoGateButton({
  children,
  actionLabel,
  className = "rounded-card border border-border-default bg-bg-panel px-3 py-2 text-sm font-medium text-fg-primary hover:bg-bg-elevated",
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
