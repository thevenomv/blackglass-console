import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6">
      <p className="mb-6 font-mono text-xs font-medium uppercase tracking-[0.14em] text-fg-faint">
        BLACKGLASS
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
    </div>
  );
}
