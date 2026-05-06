import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BLACKGLASS — live Linux drift showcase",
  description:
    "Live full-screen view of BLACKGLASS detecting configuration drift on a real Ubuntu VM. For sales decks, outreach, and blog embeds.",
  openGraph: {
    title: "BLACKGLASS — live Linux drift showcase",
    description:
      "Live full-screen view of BLACKGLASS detecting configuration drift on a real Ubuntu VM.",
    url: "https://blackglasssec.com/demo/showcase",
    siteName: "BLACKGLASS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BLACKGLASS — live Linux drift showcase",
    description:
      "Full-screen live drift detection on a real Ubuntu VM. No sign-up required.",
  },
};

export default function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
