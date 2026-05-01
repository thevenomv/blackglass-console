"use client";

import { useEffect, useRef } from "react";

/** Minimal focus containment + restore for modal surfaces (no extra deps). */
export function useFocusTrap(active: boolean, onEscape?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    prevFocus.current = document.activeElement as HTMLElement | null;

    const root = ref.current;
    if (!root) return;

    const focusables = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      const trap = ref.current;
      if (!trap) return;

      if (e.key === "Escape") {
        onEscape?.();
        return;
      }
      if (e.key !== "Tab" || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const cur = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (cur === first || !trap.contains(cur)) {
          e.preventDefault();
          last.focus();
        }
      } else if (cur === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prevFocus.current?.focus?.();
    };
  }, [active, onEscape]);

  return ref;
}
