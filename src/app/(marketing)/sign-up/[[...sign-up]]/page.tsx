export const dynamic = "force-dynamic";

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6">
      <p className="mb-6 font-mono text-xs font-medium uppercase tracking-[0.14em] text-fg-faint">
        BLACKGLASS
      </p>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard"
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
