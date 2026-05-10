import type { MetadataRoute } from "next";
import { siteOrigin, siteShouldNoindex } from "@/lib/site";

/** Public marketing, use-case, guide, docs, and legal pages only. Console routes are NOT indexed. */
const PATHS = [
  // Core marketing
  "/",
  "/product",
  "/pricing",
  "/security",
  "/demo",
  "/book",
  "/contact-sales",
  // Legal
  "/privacy",
  "/terms",
  "/dpa",
  "/subprocessors",
  // Pricing flow
  "/pricing/success",
  // Use-case pages
  "/use-cases",
  "/use-cases/linux-configuration-drift-detection",
  "/use-cases/ssh-configuration-audit",
  "/use-cases/linux-hardening-monitoring",
  "/use-cases/cis-benchmark-monitoring",
  // Guides + docs
  "/guides/how-to-detect-unauthorized-linux-config-changes",
  "/docs/snapshot-freshness",
  "/docs/api",
  // Free tools (public, no signup)
  "/tools",
  "/tools/cloud-waste-estimator",
  "/tools/linux-drift-risk",
  "/tools/cloud-inventory-diff",
  // Trust + freshness
  "/changelog",
  "/status",
  "/recover",
] as const;

const PRIORITY: Record<string, number> = {
  "/": 1.0,
  "/product": 0.9,
  "/pricing": 0.9,
  "/demo": 0.85,
  "/contact-sales": 0.85,
  "/security": 0.7,
  "/book": 0.7,
  "/changelog": 0.7,
  "/status": 0.6,
  "/use-cases": 0.8,
  "/use-cases/linux-configuration-drift-detection": 0.8,
  "/use-cases/ssh-configuration-audit": 0.8,
  "/use-cases/linux-hardening-monitoring": 0.8,
  "/use-cases/cis-benchmark-monitoring": 0.75,
  "/guides/how-to-detect-unauthorized-linux-config-changes": 0.75,
  "/docs/snapshot-freshness": 0.7,
  "/docs/api": 0.7,
  "/tools": 0.7,
  "/tools/cloud-waste-estimator": 0.7,
  "/tools/linux-drift-risk": 0.7,
  "/tools/cloud-inventory-diff": 0.7,
  "/recover": 0.55,
  "/subprocessors": 0.5,
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

