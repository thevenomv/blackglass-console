"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useMemo, type ReactNode } from "react";

function clerkAppearance(isDark: boolean) {
  return {
    variables: isDark
      ? {
          colorPrimary: "#3b82f6",
          colorText: "#f2f5f8",
          colorTextSecondary: "#9aa5b1",
          colorBackground: "#161d26",
          colorInputBackground: "#1b2430",
          colorNeutral: "#9aa5b1",
        }
      : {
          colorPrimary: "#2563eb",
          colorText: "#0f172a",
          colorTextSecondary: "#475569",
          colorBackground: "#ffffff",
          colorInputBackground: "#f8fafc",
          colorNeutral: "#64748b",
        },
  };
}

/** Wraps Clerk so sign-in/up surfaces follow `data-theme` (light vs dark console). */
export function ClerkThemedProvider({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const appearance = useMemo(() => clerkAppearance(theme === "dark"), [theme]);

  return (
    <ClerkProvider publishableKey={publishableKey} appearance={appearance}>
      {children}
    </ClerkProvider>
  );
}
