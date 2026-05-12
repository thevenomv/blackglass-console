import Link from "next/link";
import { marketingMailtoHref } from "@/lib/marketing/contact";

/**
 * Shared layout primitive for the /vs/* comparison pages.
 *
 * The comparison page brief is deliberately conservative:
 *   - Public information only — no pricing claims about the competitor.
 *   - Framing is "where each fits", not "we destroy them".
 *   - Every comparison row is sourced from the competitor's own public
 *     marketing copy or product docs as of the page's `lastReviewed` date,
 *     so readers can audit the claims.
 *
 * If you want a more aggressive battlecard, build it on the internal wiki —
 * not on the public marketing site. This page exists to capture
 * "alternatives to X" / "X vs alternatives" search traffic with an
 * honest framing that converts research-mode readers into demo bookings.
 */

export interface ComparisonRow {
  /** What capability or concern is being compared. */
  readonly capability: string;
  /** Honest, public-info statement about the competitor. */
  readonly competitor: string;
  /** Honest, public-info statement about Blackglass. */
  readonly blackglass: string;
}

export interface WhenToPick {
  readonly heading: string;
  readonly bullets: ReadonlyArray<string>;
}

export interface VsPageProps {
  readonly competitorName: string;
  /** Short positioning statement Blackglass ascribes to the competitor (1 sentence). */
  readonly competitorPositioning: string;
  /** What Blackglass is, in 1 sentence, for context. */
  readonly blackglassPositioning: string;
  /** Short paragraph framing the relationship (complementary vs alternative). */
  readonly relationship: string;
  readonly comparison: ReadonlyArray<ComparisonRow>;
  readonly pickCompetitor: WhenToPick;
  readonly pickBlackglass: WhenToPick;
  /**
   * Date the competitor information was last verified against their
   * public site. Surfaces in the page footer so readers (and the
   * competitor's own legal team) can see when claims were sourced.
   */
  readonly lastReviewed: string;
  /** Sources used to verify competitor claims. */
  readonly sources: ReadonlyArray<{ label: string; href: string }>;
  /** Optional cross-links to other /vs pages (topical clustering). */
  readonly relatedComparisons?: ReadonlyArray<{ href: string; label: string }>;
}

export function VsLayout(props: VsPageProps) {
  const {
    competitorName,
    competitorPositioning,
    blackglassPositioning,
    relationship,
    comparison,
    pickCompetitor,
    pickBlackglass,
    lastReviewed,
    sources,
    relatedComparisons,
  } = props;

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">
        Compare
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
        Blackglass vs {competitorName}
      </h1>
      <p className="mt-4 text-lg leading-relaxed">{relationship}</p>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <article className="rounded-card border border-border-default bg-bg-panel p-5">
          <p className="text-sm font-semibold text-fg-primary">{competitorName}</p>
          <p className="mt-2 text-sm leading-relaxed">{competitorPositioning}</p>
        </article>
        <article className="rounded-card border border-accent-blue/40 bg-accent-blue/5 p-5">
          <p className="text-sm font-semibold text-fg-primary">Blackglass</p>
          <p className="mt-2 text-sm leading-relaxed">{blackglassPositioning}</p>
        </article>
      </section>

      <h2 className="mt-14 text-xl font-semibold text-fg-primary">
        Capability comparison
      </h2>
      <p className="mt-2 text-sm leading-relaxed">
        Drawn from {competitorName}&rsquo;s public product pages and Blackglass docs as of {lastReviewed}.
        Capabilities not listed are typically out of scope for both products.
      </p>
      <div className="mt-6 overflow-x-auto rounded-card border border-border-default bg-bg-panel/50">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border-default bg-bg-panel">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-fg-faint">
                Capability
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-fg-faint">
                {competitorName}
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-fg-faint">
                Blackglass
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr key={row.capability} className="border-b border-border-default/50 last:border-0">
                <td className="px-4 py-3 align-top text-sm font-medium text-fg-primary">
                  {row.capability}
                </td>
                <td className="px-4 py-3 align-top text-sm leading-relaxed">{row.competitor}</td>
                <td className="px-4 py-3 align-top text-sm leading-relaxed">{row.blackglass}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-14 grid gap-5 sm:grid-cols-2">
        <article className="rounded-card border border-border-default bg-bg-panel p-5">
          <h2 className="text-base font-semibold text-fg-primary">{pickCompetitor.heading}</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed">
            {pickCompetitor.bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span aria-hidden className="mt-0.5 shrink-0 text-fg-faint">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-card border border-accent-blue/40 bg-accent-blue/5 p-5">
          <h2 className="text-base font-semibold text-fg-primary">{pickBlackglass.heading}</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed">
            {pickBlackglass.bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span aria-hidden className="mt-0.5 shrink-0 text-fg-faint">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="mt-14 rounded-card border border-border-default bg-bg-panel p-6">
        <h2 className="text-base font-semibold text-fg-primary">
          Try Blackglass against the {competitorName} sales motion
        </h2>
        <p className="mt-2 text-sm leading-relaxed">
          Most prospects evaluating both end up keeping {competitorName} for cloud-posture and
          adding Blackglass for the in-server visibility their existing tool can&rsquo;t reach.
          The 14-day trial covers up to 10 hosts and doesn&rsquo;t need a card.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
          >
            Open the demo workspace
          </Link>
          <Link
            href="/contact-sales"
            className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
          >
            Talk to sales
          </Link>
        </div>
      </section>

      {relatedComparisons && relatedComparisons.length > 0 ? (
        <section className="mt-14 rounded-card border border-border-default bg-bg-panel p-6">
          <h2 className="text-base font-semibold text-fg-primary">Related comparisons</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {relatedComparisons.map((r) => (
              <li key={r.href}>
                <Link className="text-accent-blue hover:underline" href={r.href}>
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-12 rounded-card border border-border-default bg-bg-panel/50 p-4 text-xs text-fg-faint">
        <p>
          Comparison last reviewed against {competitorName}&rsquo;s public marketing on{" "}
          {lastReviewed}. {competitorName}&rsquo;s product evolves; if anything here is out of
          date,{" "}
          <a
            className="text-accent-blue hover:underline"
            href={marketingMailtoHref(`Comparison update: ${competitorName}`)}
          >
            tell us where
          </a>{" "}
          and we&rsquo;ll fix it.
        </p>
        {sources.length > 0 ? (
          <p className="mt-3">
            Sources:{" "}
            {sources.map((s, i) => (
              <span key={s.href}>
                <a
                  className="text-accent-blue hover:underline"
                  href={s.href}
                  rel="nofollow noopener"
                  target="_blank"
                >
                  {s.label}
                </a>
                {i < sources.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        ) : null}
      </footer>
    </main>
  );
}
