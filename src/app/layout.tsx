import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { Providers } from "@/components/providers/Providers";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export const metadata: Metadata = {
  title: "BLACKGLASS",
  description: "Operational integrity for Linux hosts — by Obsidian Dynamics Limited.",
};

const themeInit = `(function(){try{var k="blackglass-theme";var t=localStorage.getItem(k);if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}else{document.documentElement.setAttribute("data-theme","dark");}}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <Script id="blackglass-theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <ThemeProvider>
          <SessionProvider>
            <Providers>{children}</Providers>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
