import type { MetadataRoute } from "next";
import { siteOrigin, siteShouldNoindex } from "@/lib/site";

/** Public-ish routes indexed for discovery (console remains mostly auth-gated in practice). */
const PATHS = ["/", "/pricing", "/pricing/success", "/privacy", "/terms", "/demo"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin() ?? "http://localhost:3000";

  if (siteShouldNoindex()) {
    return [];
  }

  const now = new Date();
  return PATHS.map((path) => ({
    url: `${origin}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? ("daily" as const) : ("monthly" as const),
    priority: path === "/" ? 1 : path === "/pricing" ? 0.9 : 0.6,
  }));
}
