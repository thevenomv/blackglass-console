import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Blackglass",
  // Auth surface — must never be indexed (no SEO value, duplicate-content risk).
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
    redirect("/login");
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6">
      <p className="mb-6 font-mono text-xs font-medium uppercase tracking-[0.14em] text-fg-faint">
        Blackglass
      </p>
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-bg-panel border border-border-default shadow-elevated",
          },
        }}
      />
      <p className="mt-6 max-w-md text-center text-xs text-fg-faint">
        <Link href="/recover#workspace" className="text-accent-blue hover:underline">
          Can&rsquo;t sign in?
        </Link>
      </p>
    </div>
  );
}
