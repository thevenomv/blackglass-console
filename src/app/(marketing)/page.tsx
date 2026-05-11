import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/LandingPage";
import { canonical, defaultOgImages, defaultTwitterImages } from "@/lib/seo";

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
    images: defaultOgImages(),
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: defaultTwitterImages(),
  },
};

export default function HomePage() {
  return <LandingPage />;
}
