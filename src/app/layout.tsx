import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { Providers } from "@/components/providers/Providers";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ClerkThemedProvider } from "@/components/clerk/ClerkThemedProvider";
import { siteOrigin, siteShouldNoindex } from "@/lib/site";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE_DESCRIPTION =
  "Operational integrity for Linux hosts — fleet baselines, drift triage, and evidence exports.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Default shell matches light theme tokens (`globals.css`); dark mode uses toggle + `data-theme`.
  themeColor: "#f1f5f9",
};

function metadataBaseOptional(): Metadata["metadataBase"] {
  const o = siteOrigin();
  if (!o) return undefined;
  try {
    return new URL(o);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBaseOptional(),
  title: "BLACKGLASS",
  description: SITE_DESCRIPTION,
  applicationName: "BLACKGLASS",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
  referrer: "strict-origin-when-cross-origin",
  robots: siteShouldNoindex()
    ? { index: false, follow: false, googleBot: { index: false, follow: false } }
    : { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "BLACKGLASS",
    title: "BLACKGLASS",
    description: SITE_DESCRIPTION,
    // Prefer light-themed artwork for og:image when added (see docs/theming.md).
    // Add `metadata.openGraph.images` plus a static asset under `public/` when you ship share art.
  },
  formatDetection: { telephone: false },
  category: "technology",
};

const themeInit = `(function(){try{var k="blackglass-theme";var t=localStorage.getItem(k);if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}else{var d=typeof matchMedia!=="undefined"&&matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-theme",d?"dark":"light");}}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const origin = siteOrigin();
  const jsonLdWebSite =
    origin && !siteShouldNoindex()
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "BLACKGLASS",
          description: SITE_DESCRIPTION,
          url: `${origin}/`,
        })
      : null;

  // ClerkProvider is a client component that only needs the publishable key.
  // Do not gate on isClerkAuthEnabled() (which also checks CLERK_SECRET_KEY)
  // because that server-only var may be absent at render time, causing
  // <SignIn>/<SignUp> to render without context and throw.
  const clerkPk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const inner = (
    <SessionProvider>
      <Providers>{children}</Providers>
    </SessionProvider>
  );

  return (
    <html lang="en-GB" data-theme="light" suppressHydrationWarning>
      <body className={`${plexSans.variable} ${plexMono.variable}`}>
        {jsonLdWebSite ? (
          <script
            type="application/ld+json"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: jsonLdWebSite }}
          />
        ) : null}
        <Script id="blackglass-theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <ThemeProvider>
          {clerkPk ? <ClerkThemedProvider publishableKey={clerkPk}>{inner}</ClerkThemedProvider> : inner}
        </ThemeProvider>
      </body>
    </html>
  );
}
