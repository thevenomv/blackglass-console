import type { Metadata } from "next";

// Retained only so legacy inbound links keep functioning. The page itself
// permanentRedirects to /demo/sandbox; this metadata never renders in the
// happy path but stays accurate in case the redirect is ever bypassed
// (e.g. by a crawler that ignores 308s).
export const metadata: Metadata = {
  title: "Walkthrough — Blackglass drift scenarios",
  description:
    "Eight real drift scenarios on a Linux host with severity, rationale, and remediation. The live ephemeral sandbox at this URL has been retired in favour of a static walkthrough.",
  alternates: {
    canonical: "/demo/sandbox",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
