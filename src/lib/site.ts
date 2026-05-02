/** Deployed origin (`https://…`) for canonical URLs, `sitemap.xml`, `robots.txt`. */
export function siteOrigin(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

/** When **`true`**, root metadata + `robots.txt` disallow indexing — use staging / previews. */
export function siteShouldNoindex(): boolean {
  return process.env.NEXT_PUBLIC_SITE_NOINDEX === "true";
}
