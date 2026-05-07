/**
 * Per-tenant sample-data toggle.
 *
 * Backed by a session cookie (`bg-sample-data`). When set to "on", server
 * components and route handlers that respect the toggle render the same
 * pre-built mock fleet/drift data as `NEXT_PUBLIC_USE_MOCK=true`, but only
 * for the requesting browser session — production data for everyone else
 * is unaffected.
 *
 * Why a cookie instead of a per-tenant DB column:
 *   - No migration required.
 *   - Per-browser is the right granularity for "show me what the demo
 *     looks like before I connect a real host".
 *   - An operator who wants to demo the product to a customer in a meeting
 *     doesn't pollute every other admin's dashboard.
 */

import { cookies } from "next/headers";

export const SAMPLE_DATA_COOKIE = "bg-sample-data";

/** Read the current value (true if the caller has opted into sample data). */
export async function isSampleDataEnabled(): Promise<boolean> {
  try {
    const jar = await cookies();
    return jar.get(SAMPLE_DATA_COOKIE)?.value === "on";
  } catch {
    // cookies() throws outside the request context (e.g. during build prerender).
    // Default to "off" so production renders never accidentally show samples.
    return false;
  }
}
