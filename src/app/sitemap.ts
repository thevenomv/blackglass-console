import type { MetadataRoute } from "next";
import { siteOrigin, siteShouldNoindex } from "@/lib/site";

/** Public marketing, use-case, guide, and legal pages only. Console routes are NOT indexed. */
const PATHS = [
  // Core marketing
  "/",
  "/product",
  "/pricing",
  "/security",
  "/demo",
  "/book",
  // Legal
  "/privacy",
  "/terms",
  "/dpa",
  // Pricing flow
  "/pricing/success",
  // Use-case pages
  "/use-cases",
  "/use-cases/linux-configuration-drift-detection",
  "/use-cases/ssh-configuration-audit",
  "/use-cases/linux-hardening-monitoring",
  "/use-cases/cis-benchmark-monitoring",
  // Guides
  "/guides/how-to-detect-unauthorized-linux-config-changes",
] as const;

const PRIORITY: Record<string, number> = {
  "/": 1.0,
  "/product": 0.9,
  "/pricing": 0.9,
  "/demo": 0.85,
  "/security": 0.7,
  "/book": 0.7,
  "/use-cases": 0.8,
  "/use-cases/linux-configuration-drift-detection": 0.8,
  "/use-cases/ssh-configuration-audit": 0.8,
  "/use-cases/linux-hardening-monitoring": 0.8,
  "/use-cases/cis-benchmark-monitoring": 0.75,
  "/guides/how-to-detect-unauthorized-linux-config-changes": 0.75,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin() ?? "http://localhost:3000";

  if (siteShouldNoindex()) {
    return [];
  }

  const now = new Date();
  return PATHS.map((path) => ({
    url: `${origin}${path}`,
    lastModified: now,
    changeFrequency: (path === "/" || path.startsWith("/use-cases") || path.startsWith("/guides")
      ? "weekly"
      : "monthly") as "weekly" | "monthly",
    priority: PRIORITY[path] ?? 0.6,
  }));
}

