import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<
  Variant,
  string
> = {
  primary:
    "bg-accent-blue text-white hover:bg-accent-blue-hover active:bg-accent-blue-muted shadow-none",
  secondary:
    "border border-border-default bg-transparent text-fg-primary hover:bg-bg-elevated",
  ghost: "text-fg-muted hover:text-fg-primary hover:bg-bg-elevated bg-transparent",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 items-center justify-center rounded-card px-4 text-sm font-medium transition-colors duration-150 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
