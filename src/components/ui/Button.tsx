import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<
  Variant,
  string
> = {
  primary:
    "bg-accent-blue text-white hover:bg-accent-blue-hover active:bg-accent-blue-muted shadow-none",
  secondary:
    "border border-border-default bg-transparent text-fg-primary hover:bg-bg-elevated",
  ghost: "text-fg-muted hover:text-fg-primary hover:bg-bg-elevated bg-transparent",
  danger:
    "bg-danger text-white hover:bg-danger/90 border border-transparent shadow-none",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    children: ReactNode;
  }
>(function Button({ variant = "primary", className = "", children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex h-9 items-center justify-center rounded-card px-4 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
