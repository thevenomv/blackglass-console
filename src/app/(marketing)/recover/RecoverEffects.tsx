"use client";

import { useEffect } from "react";

/**
 * Scroll to the right section when arriving via:
 * - `/recover?section=passphrase|workspace` (redirects from old URLs)
 * - `/recover#passphrase` or `#workspace` (links from /login and /sign-in)
 *
 * Next.js client navigations do not always replicate native hash scrolling,
 * so we mirror it once after paint.
 */
export function RecoverEffects({ section }: { section?: string }) {
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const target =
      hash === "passphrase" || hash === "workspace"
        ? hash
        : section === "passphrase" || section === "workspace"
          ? section
          : null;
    if (!target) return;
    requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [section]);

  return null;
}
