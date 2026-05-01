import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--bg-base)",
          sidebar: "var(--bg-sidebar)",
          panel: "var(--bg-panel)",
          elevated: "var(--bg-panel-elevated)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          subtle: "var(--border-subtle)",
        },
        fg: {
          primary: "var(--text-primary)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        accent: {
          blue: "var(--accent-blue)",
          "blue-hover": "var(--accent-blue-hover)",
          "blue-soft": "var(--accent-blue-soft-bg)",
          "blue-muted": "var(--accent-blue-muted)",
        },
        success: {
          DEFAULT: "var(--success-green)",
          soft: "var(--success-green-soft-bg)",
        },
        warning: {
          DEFAULT: "var(--warning-amber)",
          soft: "var(--warning-amber-soft-bg)",
        },
        danger: {
          DEFAULT: "var(--danger-red)",
          soft: "var(--danger-red-soft-bg)",
        },
        track: "var(--progress-track)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      spacing: {
        "18": "4.5rem",
      },
      borderRadius: {
        card: "6px",
      },
      boxShadow: {
        elevated: "0 1px 2px rgba(0, 0, 0, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
