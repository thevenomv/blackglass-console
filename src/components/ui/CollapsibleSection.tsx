"use client";

import type { ReactNode } from "react";

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  id,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  id?: string;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group rounded-card border border-border-default bg-bg-panel"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-fg-primary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          {title}
          <span className="text-xs font-normal text-fg-faint group-open:hidden">Expand</span>
          <span className="hidden text-xs font-normal text-fg-faint group-open:inline">
            Collapse
          </span>
        </span>
      </summary>
      <div className="border-t border-border-subtle px-4 py-3">{children}</div>
    </details>
  );
}
