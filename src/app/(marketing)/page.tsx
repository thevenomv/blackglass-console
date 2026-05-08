import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/LandingPage";

const TITLE = "Blackglass — Know when your Linux servers drift from what you approved";
const DESCRIPTION =
  "Blackglass gives operations and security teams a calm, clear view of Linux configuration changes — with severity, context, and exports leadership can read.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Blackglass",
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
