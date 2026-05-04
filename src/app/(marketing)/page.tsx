import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/LandingPage";

const TITLE = "BLACKGLASS — Linux configuration drift detection & SSH posture auditing";
const DESCRIPTION =
  "Blackglass audits SSH posture, tracks baseline changes on your Linux servers, and gives ops and security teams a clear workflow to harden their fleet.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "BLACKGLASS",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function HomePage() {
  return <LandingPage />;
}
