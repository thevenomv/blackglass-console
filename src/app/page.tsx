import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/LandingPage";

export const metadata: Metadata = {
  title: "BLACKGLASS — Linux baseline integrity & SSH drift detection",
  description:
    "Capture baselines, detect SSH and configuration drift, and export audit-ready evidence — without gating understanding of the product.",
};

export default function HomePage() {
  return <LandingPage />;
}
