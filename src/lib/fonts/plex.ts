/**
 * IBM Plex subset list — **must match** the static `subsets: [...]` literals in
 * `src/app/layout.tsx` (`next/font/google`). Turbopack cannot analyze a spread
 * into `subsets`, so the layout file duplicates these values; this export exists
 * for tests and so grep finds a single source of truth for the subset names.
 */
export const PLEX_GOOGLE_SUBSETS = ["latin", "latin-ext"] as const;
