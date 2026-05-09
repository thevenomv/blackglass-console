import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Standard page header.
 *
 * UX intent ("less is more"):
 *  - Title is large, but the supporting chrome (breadcrumbs, subtitle, divider)
 *    stays low-contrast so it never competes with page content.
 *  - The divider underneath the header is intentionally subtle — strong
 *    separators add visual noise without earning attention.
 *  - Subtitles are optional and should be skipped whenever the title alone
 *    is self-explanatory.
 */
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
    <header className="flex flex-wrap items-end justify-between gap-4 pb-4">
      <div className="min-w-0">
        {breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-[11px] text-fg-faint">
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
