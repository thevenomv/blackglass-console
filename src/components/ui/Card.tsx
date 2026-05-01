import type { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-card border border-border-default bg-bg-panel shadow-none ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="text-[15px] font-semibold text-fg-primary">{title}</div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
