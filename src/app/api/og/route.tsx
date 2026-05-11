import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * Dynamic Open Graph image generator.
 *
 *   GET /api/og?title=Pricing&subtitle=From%20%2459%2Fmo
 *
 * Returns a 1200×630 PNG matching the `/og-default.png` static fallback so
 * the brand reads consistently across share targets. Falls back to the same
 * site title + tagline when no params are supplied.
 *
 * Why an endpoint and not per-route `opengraph-image.tsx`:
 *   - One place to evolve brand styling.
 *   - Pages opt in via `openGraph.images: [dynamicOgImage(title, subtitle)]`
 *     in their metadata block — no extra file per route.
 *   - Cached at the CDN by URL; the title/subtitle becomes the cache key.
 *
 * Edge runtime is required for `next/og`.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const title = (searchParams.get("title") ?? "Blackglass").slice(0, 90);
  const subtitle = (
    searchParams.get("subtitle") ??
    "Operational integrity for Linux fleets"
  ).slice(0, 130);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0e1a",
          color: "#f8fafc",
          padding: "72px",
          fontFamily: "Inter, system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Left accent bar */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "8px",
            backgroundColor: "#3b82f6",
            opacity: 0.6,
          }}
        />
        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            fontSize: "20px",
            fontWeight: 600,
            letterSpacing: "0.18em",
            color: "#cbd5e1",
            textTransform: "uppercase",
          }}
        >
          Blackglass
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: title.length > 60 ? "56px" : "72px",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#f8fafc",
            maxWidth: "1000px",
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        <div
          style={{
            display: "flex",
            marginTop: "24px",
            fontSize: "30px",
            fontWeight: 400,
            color: "#94a3b8",
            maxWidth: "1000px",
            lineHeight: 1.3,
          }}
        >
          {subtitle}
        </div>

        {/* Bottom-right URL */}
        <div
          style={{
            position: "absolute",
            right: "72px",
            bottom: "48px",
            fontSize: "18px",
            color: "#64748b",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}
        >
          blackglasssec.com
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Long cache — title/subtitle in the URL is the cache key, so any
        // content change naturally produces a new URL. Edge providers
        // honour this; LinkedIn / Slack preview caches operate
        // independently (~7 days).
        "cache-control": "public, max-age=31536000, immutable",
      },
    },
  );
}
