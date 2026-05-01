"use client";

import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex rounded-card border border-border-default bg-bg-panel p-0.5"
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        className={`flex-1 rounded-[5px] px-2 py-1.5 text-xs font-medium transition-colors ${
          theme === "dark"
            ? "bg-bg-elevated text-fg-primary shadow-sm"
            : "text-fg-muted hover:text-fg-primary"
        }`}
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
      >
        Dark
      </button>
      <button
        type="button"
        className={`flex-1 rounded-[5px] px-2 py-1.5 text-xs font-medium transition-colors ${
          theme === "light"
            ? "bg-bg-elevated text-fg-primary shadow-sm"
            : "text-fg-muted hover:text-fg-primary"
        }`}
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
      >
        Light
      </button>
    </div>
  );
}
