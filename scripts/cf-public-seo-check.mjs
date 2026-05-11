/**
 * No secrets — HEAD checks for crawlers and HTTPS signals.
 *   npm run cf:public-seo-check
 */

const URLS = [
  "https://blackglasssec.com/",
  "https://blackglasssec.com/sitemap.xml",
  "https://blackglasssec.com/robots.txt",
];

const HEADER_FILTER = /^(cf-|server|strict-transport|x-content-type|content-type|cache-control)/i;

async function main() {
  for (const url of URLS) {
    console.log(`\n=== ${url} ===`);
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    console.log("Status:", r.status);
    for (const [k, v] of r.headers) {
      if (HEADER_FILTER.test(k)) console.log(`  ${k}: ${v}`);
    }
  }
  console.log("\n=== robots.txt body (preview) ===");
  const rb = await fetch("https://blackglasssec.com/robots.txt");
  const text = await rb.text();
  console.log(text.slice(0, 600));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
