import Link from "next/link";
import PricingSection from "@/components/pricing/PricingSection";

export const metadata = {
  title: "Pricing | BLACKGLASS by Obsidian Dynamics",
  description:
    "BLACKGLASS is free for personal and small-lab use. Pay only when you need to protect a real fleet and collaborate as a team. A product of Obsidian Dynamics Limited.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-bg-base">
      <PricingSection />
      <div className="pb-16 text-center">
        <Link
          href="/"
          className="text-sm font-medium text-accent-blue hover:underline focus-visible:outline-none"
        >
          Back to console
        </Link>
      </div>
    </main>
  );
}