export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { OrganizationSwitcher } from "@clerk/nextjs";

export default async function SelectWorkspacePage() {
  if (!isClerkAuthEnabled()) {
    redirect("/dashboard");
  }
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-faint">Blackglass</p>
        <h1 className="text-xl font-semibold text-fg-primary">Choose a workspace</h1>
        <p className="text-sm text-fg-muted">
          You&apos;re signed in, but no organization is selected yet. Pick an existing workspace or
          create a new one to continue. Your permissions follow you automatically.
        </p>
        <div className="flex justify-center rounded-card border border-border-default bg-bg-panel p-4">
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "w-full max-w-full",
                organizationSwitcherTrigger: "w-full justify-between",
              },
            }}
          />
        </div>
        <Link href="/dashboard" className="text-sm text-accent-blue hover:underline">
          Back to console
        </Link>
      </div>
    </main>
  );
}
