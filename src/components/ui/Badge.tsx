import type { ReactNode } from "react";

export type Tone = "success" | "warning" | "danger" | "neutral" | "accent";

const tones: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "border border-border-default text-fg-muted bg-transparent",
  accent: "border border-accent-blue/35 bg-accent-blue-soft text-accent-blue",
};

export function Badge({
  tone,
  children,
  className = "",
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
