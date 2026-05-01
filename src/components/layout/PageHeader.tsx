import type { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: { href: string; label: string }[];
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border-subtle pb-5">
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-fg-faint">
              {breadcrumbs.map((c, i) => (
                <li key={c.href} className="flex items-center gap-1">
                  {i > 0 ? <span aria-hidden>/</span> : null}
                  {i < breadcrumbs.length - 1 ? (
                    <Link href={c.href} className="hover:text-accent-blue">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-fg-muted">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-fg-primary">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-fg-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
