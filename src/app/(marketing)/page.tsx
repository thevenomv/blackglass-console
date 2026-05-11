import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/LandingPage";
import { canonical, dynamicOgImages, dynamicTwitterImages } from "@/lib/seo";

const OG_TITLE = "Know when your Linux servers drift";
const OG_SUBTITLE = "Drift detection · evidence exports · cloud waste cleanup";

const TITLE = "Blackglass — Know when your Linux servers drift from what you approved";
const DESCRIPTION =
  "Blackglass gives operations and security teams a calm, clear view of Linux configuration changes — with severity, context, and exports leadership can read.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical("/") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Blackglass",
    url: canonical("/"),
    images: dynamicOgImages({ title: OG_TITLE, subtitle: OG_SUBTITLE }),
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: dynamicTwitterImages({ title: OG_TITLE, subtitle: OG_SUBTITLE }),
  },
};

export default function HomePage() {
  return <LandingPage />;
}
