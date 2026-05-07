"use client";

/**
 * Settings card that exposes the existing ThemeProvider's dark/light toggle.
 *
 * The provider already manages localStorage persistence + the early
 * `themeInit` script in app/layout.tsx prevents a flash of incorrect
 * theme on initial paint, so all this card has to do is wire UI to
 * `useTheme().setTheme(...)`.
 *
 * The light theme has been the design tokens' default since wave 1; this
 * card makes the dark/light choice discoverable for users who didn't know
 * the theme respected their `prefers-color-scheme` media query out of the
 * box.
 */

import { useTheme, type ThemeMode } from "@/components/theme/ThemeProvider";

const OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
  {
    value: "light",
    label: "Light",
    description: "Slate-on-white, optimised for daytime triage and printable evidence reviews.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Cool slate shell, optimised for low-light SOC environments.",
  },
];

export function ThemeToggleSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg-primary">Appearance</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Pick the theme variant for this browser. The choice persists in
          local storage and respects your operating-system preference until
          you set it explicitly.
        </p>
      </div>

      <div role="radiogroup" aria-label="Theme" className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(opt.value)}
              className={`flex flex-col items-start rounded-card border px-3 py-2.5 text-left transition-colors ${
                active
                  ? "border-accent-blue bg-accent-blue-soft/40"
                  : "border-border-default bg-bg-elevated hover:border-border-strong"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-fg-primary">
                <span
                  aria-hidden
                  className={`inline-flex h-3 w-3 items-center justify-center rounded-full border ${
                    active ? "border-accent-blue bg-accent-blue" : "border-border-default"
                  }`}
                >
                  {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                </span>
                {opt.label}
              </span>
              <span className="mt-1 text-xs text-fg-muted">{opt.description}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-fg-faint">
        Tip: the in-app docs drawer and the command palette inherit your
        theme automatically. PDF reports always render light for print
        consistency.
      </p>
    </section>
  );
}
