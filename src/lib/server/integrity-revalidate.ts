import { revalidatePath } from "next/cache";

/** Product surfaces that read fleet, inventory, or drift via SSR / fetch cache. */
const PATHS = ["/", "/hosts", "/drift"] as const;

export function revalidateIntegritySurfaces(): void {
  for (const p of PATHS) {
    try {
      revalidatePath(p);
    } catch {
      /* Unsupported context (e.g. static export tooling) */
    }
  }
}
