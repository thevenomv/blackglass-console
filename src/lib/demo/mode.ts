/**
 * First-class demo / sample workspace routes (`/demo/*`).
 * Product UI should not use mock seeds; those live under `src/lib/demo/seed.ts`.
 */

const PREFIX = "/demo";

export function isDemoPathname(pathname: string): boolean {
  return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`);
}
