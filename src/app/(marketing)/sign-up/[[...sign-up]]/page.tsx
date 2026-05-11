import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign up · Blackglass",
  // Auth surface — must never be indexed (no SEO value, duplicate-content risk).
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
    redirect("/login");
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6">
      <p className="mb-6 font-mono text-xs font-medium uppercase tracking-[0.14em] text-fg-faint">
        Blackglass
      </p>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/welcome"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-bg-panel border border-border-default shadow-elevated",
          },
        }}
      />
    </div>
  );
}
