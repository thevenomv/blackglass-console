import { siteOrigin, siteShouldNoindex } from "@/lib/site";
import { CHANGELOG_ENTRIES, CHANGELOG_KIND_LABEL } from "@/lib/changelog";

/**
 * RSS 2.0 feed of changelog releases.
 *
 * Source of truth lives in `src/lib/changelog.ts` and is shared with the
 * `/changelog` page so the two surfaces never drift.
 *
 * Why provide an RSS feed at all:
 *   - Power users / customers subscribe via Feedly, Reeder, NetNewsWire.
 *   - Aggregators (security newsletters, "what shipped this week" lists)
 *     consume RSS for automated coverage.
 *   - Search engines treat the existence of `<link rel="alternate"
 *     type="application/rss+xml">` as a freshness signal.
 *
 * Cached for one hour at the edge — long enough that thousands of
 * subscribers don't hammer origin, short enough that new entries surface
 * within the same morning we ship them.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(isoDate: string): string {
  // Emit at noon UTC so the feed stays stable across re-fetches even if a
  // release is logged later in the day. Real publish-minute precision isn't
  // useful for a curated changelog.
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toUTCString();
}

export function GET() {
  if (siteShouldNoindex()) {
    return new Response("", { status: 204 });
  }
  const origin = siteOrigin() ?? "https://blackglasssec.com";
  const channelLink = `${origin}/changelog`;
  const feedUrl = `${origin}/changelog/feed.xml`;

  const items = CHANGELOG_ENTRIES.map((entry) => {
    const guid = `${origin}/changelog#${entry.version}`;
    const descriptionHtml = entry.highlights
      .map(
        (h) =>
          `<p><strong>${escapeXml(CHANGELOG_KIND_LABEL[h.kind])}:</strong> ${escapeXml(h.text)}</p>`,
      )
      .join("");
    return [
      "<item>",
      `<title>${escapeXml(`Blackglass ${entry.version}`)}</title>`,
      `<link>${escapeXml(channelLink)}</link>`,
      `<guid isPermaLink="false">${escapeXml(guid)}</guid>`,
      `<pubDate>${rfc822(entry.date)}</pubDate>`,
      `<description><![CDATA[${descriptionHtml}]]></description>`,
      "</item>",
    ].join("");
  }).join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">` +
    `<channel>` +
    `<title>Blackglass changelog</title>` +
    `<link>${escapeXml(channelLink)}</link>` +
    `<description>Recent releases, security fixes, and product polish for Blackglass.</description>` +
    `<language>en-GB</language>` +
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>` +
    items +
    `</channel></rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
