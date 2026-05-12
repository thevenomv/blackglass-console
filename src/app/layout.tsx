import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { Providers } from "@/components/providers/Providers";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ClerkThemedProvider } from "@/components/clerk/ClerkThemedProvider";
import { siteOrigin, siteShouldNoindex } from "@/lib/site";
import { organizationSchema } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

const plexSans = IBM_Plex_Sans({
  // Must be a static array literal — Turbopack rejects `subsets: [...PLEX_GOOGLE_SUBSETS]`
  // for next/font (see DO build). Keep in sync with `src/lib/fonts/plex.ts`.
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE_DESCRIPTION =
  "Operational integrity for Linux hosts — fleet baselines, finding triage, and evidence exports.";

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
  title: "Blackglass",
  description: SITE_DESCRIPTION,
  applicationName: "Blackglass",
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
    siteName: "Blackglass",
    title: "Blackglass",
    description: SITE_DESCRIPTION,
    // Sitewide default share image. Per-page metadata overrides as needed.
    // 1200×630 PNG; resolved against `metadataBase` so a leading `/` works.
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "Blackglass — operational integrity for Linux fleets",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blackglass",
    description: SITE_DESCRIPTION,
    images: ["/og-default.png"],
  },
  formatDetection: { telephone: false },
  category: "technology",
  // RSS auto-discovery for the public changelog feed. Browsers (and
  // feed readers like NetNewsWire / Feedly) surface this so users can
  // subscribe without finding the link buried at the bottom of /changelog.
  alternates: {
    types: {
      "application/rss+xml": [{ url: "/changelog/feed.xml", title: "Blackglass changelog" }],
    },
  },
};

const themeInit = `(function(){try{var k="blackglass-theme";var t=localStorage.getItem(k);if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}else{var d=typeof matchMedia!=="undefined"&&matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-theme",d?"dark":"light");}}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const origin = siteOrigin();
  const showSchema = Boolean(origin) && !siteShouldNoindex();
  const jsonLdWebSite = showSchema
    ? {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Blackglass",
        description: SITE_DESCRIPTION,
        url: `${origin}/`,
      }
    : null;
  const jsonLdOrganization = showSchema ? organizationSchema() : null;

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
        {jsonLdWebSite ? <JsonLd data={jsonLdWebSite} id="schema-website" /> : null}
        {jsonLdOrganization ? <JsonLd data={jsonLdOrganization} id="schema-organization" /> : null}
        <Script id="blackglass-theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <ThemeProvider>
          {clerkPk ? <ClerkThemedProvider publishableKey={clerkPk}>{inner}</ClerkThemedProvider> : inner}
        </ThemeProvider>
        <Script
          id="apollo-tracker"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var n=Math.random().toString(36).substring(7),o=document.createElement("script");o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache="+n,o.async=!0,o.defer=!0,o.onload=function(){window.trackingFunctions.onLoad({appId:"69de4b24cd8c58000d6e1933"})},document.head.appendChild(o)})();`,
          }}
        />
      </body>
    </html>
  );
}
