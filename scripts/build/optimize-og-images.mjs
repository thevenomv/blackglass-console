#!/usr/bin/env node
/**
 * Re-encode the static OG images in `public/` for smaller payload.
 *
 * Why this exists:
 *   - The hand-exported `og-default.png` / `og-tools.png` weigh ~1.6 MB each,
 *     which is well above Facebook/LinkedIn/Twitter's recommended 100–300 KB.
 *     Big OG images hurt link-preview latency, especially on mobile.
 *   - Re-encoding through sharp with palette quantisation cuts the file size
 *     roughly 10× without any visible loss for our flat-colour designs.
 *   - We also emit `.webp` siblings so the runtime can serve a 4–5× smaller
 *     variant to crawlers that accept it (LinkedIn since 2023, Slack always,
 *     Facebook since 2024). The .png is kept as the OG URL for max
 *     compatibility — replacing the URL would bust every shared link's cached
 *     preview.
 *
 * Usage:
 *   node scripts/build/optimize-og-images.mjs
 *
 * Re-run any time the source PNGs are updated. The script is idempotent: it
 * compares output sizes and skips re-write when the existing file is already
 * smaller (so accidentally running it twice doesn't grow the file).
 *
 * `sharp` is a transitive dependency of `next` — no separate install needed.
 */

import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";

const PUBLIC_DIR = new URL("../../public/", import.meta.url);

// Files to optimise. Brand assets in /public root + /public/brand.
const TARGETS = [
  { rel: "og-default.png", maxWidth: 1200 },
  { rel: "og-tools.png", maxWidth: 1200 },
  { rel: "brand/logo-email.png", maxWidth: 480 },
];

const sharp = (await import("sharp")).default;

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

let totalBefore = 0;
let totalAfter = 0;

for (const { rel, maxWidth } of TARGETS) {
  const abs = new URL(rel, PUBLIC_DIR).pathname.replace(/^\//, "");
  // On Windows pathname starts with "/C:/..." — strip the leading "/".
  const filePath = process.platform === "win32" ? abs : `/${abs}`;
  const stat = statSync(filePath);
  totalBefore += stat.size;

  const original = sharp(filePath);
  const meta = await original.metadata();

  // Resize down only if larger than the OG target width. Never upscale.
  const resized = meta.width && meta.width > maxWidth
    ? original.resize({ width: maxWidth, withoutEnlargement: true })
    : original;

  // PNG re-encode with palette + max compression. For brand-flat artwork this
  // is visually identical to the source.
  const pngBuf = await resized
    .clone()
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();

  // WebP sibling — much smaller, served to crawlers that accept image/webp.
  const webpBuf = await resized
    .clone()
    .webp({ quality: 82, effort: 6 })
    .toBuffer();

  if (pngBuf.length < stat.size) {
    writeFileSync(filePath, pngBuf);
    console.log(`  ${rel}: ${fmtKb(stat.size)} → ${fmtKb(pngBuf.length)} (-${(100 - (pngBuf.length / stat.size) * 100).toFixed(0)}%)`);
  } else {
    console.log(`  ${rel}: already optimised (${fmtKb(stat.size)})`);
  }
  totalAfter += Math.min(pngBuf.length, stat.size);

  const webpPath = filePath.replace(/\.png$/i, ".webp");
  writeFileSync(webpPath, webpBuf);
  const parsed = parse(rel);
  console.log(`  ${parsed.dir ? parsed.dir + "/" : ""}${parsed.name}.webp: ${fmtKb(webpBuf.length)} (companion)`);
}

console.log("");
console.log(`Total PNG: ${fmtKb(totalBefore)} → ${fmtKb(totalAfter)} (-${(100 - (totalAfter / totalBefore) * 100).toFixed(0)}%)`);
