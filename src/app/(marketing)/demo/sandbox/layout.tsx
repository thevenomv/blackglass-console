import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Ubuntu VM — real-time drift detection · Blackglass",
  description:
    "Watch Blackglass detect live configuration drift on a real Ubuntu 22.04 VM. Backdoors, rogue users, sshd changes — flagged in under 10 seconds. No sign-up required.",
  openGraph: {
    title: "Live Ubuntu VM — real-time drift detection · Blackglass",
    description:
      "Watch Blackglass detect live configuration drift on a real Ubuntu 22.04 VM. Backdoors, rogue users, sshd changes — flagged in under 10 seconds. No sign-up required.",
    url: "https://blackglasssec.com/demo/sandbox",
    siteName: "Blackglass",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Ubuntu VM — real-time drift detection · Blackglass",
    description:
      "Watch Blackglass detect live configuration drift on a real Ubuntu 22.04 VM. Flagged in under 10 seconds.",
  },
};

export default function SandboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
