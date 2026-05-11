import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
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
  // Use-case pages
  "/use-cases",
  "/use-cases/linux-configuration-drift-detection",
  "/use-cases/ssh-configuration-audit",
  "/use-cases/linux-hardening-monitoring",
  "/use-cases/cis-benchmark-monitoring",
  "/use-cases/file-integrity-monitoring",
  "/use-cases/sox-evidence-capture",
  "/use-cases/incident-response-baselines",
  // Guides + docs
  "/guides/how-to-detect-unauthorized-linux-config-changes",
  "/docs/snapshot-freshness",
  "/docs/api",
  // Free tools (public, no signup)
  "/tools",
  "/tools/cloud-waste-estimator",
  "/tools/linux-drift-risk",
  "/tools/cloud-inventory-diff",
  // Comparison pages
  "/vs",
  "/vs/wiz",
  "/vs/lacework",
  "/vs/orca",
  // Blog
  "/blog",
  "/blog/seo-for-a-b2b-linux-security-tool",
  "/blog/charon-design-rationale",
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
  "/use-cases/file-integrity-monitoring": 0.8,
  "/use-cases/sox-evidence-capture": 0.8,
  "/use-cases/incident-response-baselines": 0.8,
  "/guides/how-to-detect-unauthorized-linux-config-changes": 0.75,
  "/docs/snapshot-freshness": 0.7,
  "/docs/api": 0.7,
  "/tools": 0.7,
  "/tools/cloud-waste-estimator": 0.7,
  "/tools/linux-drift-risk": 0.7,
  "/tools/cloud-inventory-diff": 0.7,
  "/vs": 0.8,
  "/vs/wiz": 0.85,
  "/vs/lacework": 0.85,
  "/vs/orca": 0.85,
  "/blog": 0.7,
  "/blog/seo-for-a-b2b-linux-security-tool": 0.7,
  "/blog/charon-design-rationale": 0.7,
  "/recover": 0.55,
  "/subprocessors": 0.5,
};

/**
 * Map a public URL path to the source file that renders it. We resolve
 * `lastmod` against this file's git history (with file mtime as fallback)
 * so Google sees a real freshness signal per route, not a single
 * build-time timestamp on every URL.
 */
function pageSourceFor(path: string): string | null {
  const cwd = process.cwd();
  const candidates: string[] = [];
  if (path === "/") {
    candidates.push("src/app/(marketing)/page.tsx");
  } else {
    const trimmed = path.replace(/^\//, "").replace(/\/$/, "");
    candidates.push(`src/app/(marketing)/${trimmed}/page.tsx`);
  }
  for (const rel of candidates) {
    const abs = join(cwd, rel);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Resolve the most recent meaningful change timestamp for a page.
 *
 * Order of preference:
 *   1. `git log -1 --format=%cI <file>` — last commit that touched the file.
 *      This is the "real" content-freshness signal and survives across CI
 *      checkouts (mtime is reset on clone; git history isn't).
 *   2. File mtime — fallback when git is unavailable (e.g. ephemeral build
 *      environments without `.git`).
 *   3. Build-time `Date.now()` — final fallback so we never emit an empty
 *      `<lastmod>`.
 *
 * Cached per build because Next.js may call this for many paths.
 */
const LASTMOD_CACHE = new Map<string, Date>();
function lastModifiedFor(path: string): Date {
  const cached = LASTMOD_CACHE.get(path);
  if (cached) return cached;

  const src = pageSourceFor(path);
  let resolved: Date | null = null;

  if (src) {
    try {
      const stdout = execFileSync(
        "git",
        ["log", "-1", "--format=%cI", "--", src],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3_000 },
      ).trim();
      if (stdout) {
        const parsed = new Date(stdout);
        if (!Number.isNaN(parsed.getTime())) resolved = parsed;
      }
    } catch {
      // git unavailable or file untracked — fall through to mtime.
    }
    if (!resolved) {
      try {
        resolved = statSync(src).mtime;
      } catch {
        // ignore
      }
    }
  }

  const out = resolved ?? new Date();
  LASTMOD_CACHE.set(path, out);
  return out;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin() ?? "http://localhost:3000";

  if (siteShouldNoindex()) {
    return [];
  }

  return PATHS.map((path) => ({
    url: `${origin}${path}`,
    lastModified: lastModifiedFor(path),
    changeFrequency: (path === "/" || path.startsWith("/use-cases") || path.startsWith("/guides")
      ? "weekly"
      : "monthly") as "weekly" | "monthly",
    priority: PRIORITY[path] ?? 0.6,
  }));
}
