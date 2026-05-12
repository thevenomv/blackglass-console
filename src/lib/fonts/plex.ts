/**
 * IBM Plex via `next/font/google` — shared subsets/weights so UI and tests stay aligned.
 *
 * We include **latin-ext** alongside **latin** so Central/Western European diacritics
 * render from the loaded webfont instead of falling back per-glyph (which can look
 * like “random” mixed fonts or tofu boxes when only `latin` was requested).
 */
export const PLEX_GOOGLE_SUBSETS = ["latin", "latin-ext"] as const;
