import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleSchema, breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { formatBlogDate, getBlogPost } from "@/lib/blog";

const SLUG = "charon-design-rationale";
const POST = getBlogPost(SLUG)!;
const PATH = `/blog/${SLUG}`;
const POST_URL = canonical(PATH) ?? PATH;

export const metadata: Metadata = {
  title: `${POST.title} · Blackglass`,
  description: POST.excerpt,
  alternates: { canonical: canonical(PATH) },
  openGraph: {
    title: POST.title,
    description: POST.excerpt,
    type: "article",
    siteName: "Blackglass",
    url: canonical(PATH),
    publishedTime: POST.date,
    authors: [POST.author.name],
    tags: [...POST.tags],
    images: dynamicOgImages({
      title: POST.title,
      subtitle: `${POST.readingTime} · ${POST.author.name}`,
    }),
  },
};

export default function Post() {
  return (
    <main className="guide-article mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Blog", url: "/blog" },
          { name: POST.title, url: PATH },
        ])}
      />
      <JsonLd
        id="schema-article"
        data={articleSchema({
          url: POST_URL,
          headline: POST.title,
          description: POST.excerpt,
          datePublished: POST.date,
          author: POST.author,
          tags: POST.tags,
        })}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Product</p>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">{POST.title}</h1>
      <p className="mt-3 text-sm text-fg-faint">
        <time dateTime={POST.date}>{formatBlogDate(POST.date)}</time> · {POST.readingTime} ·{" "}
        {POST.author.name}, {POST.author.role}
      </p>

      <p className="mt-8 text-lg leading-relaxed">
        Charon is the cloud-resource hygiene add-on that ships inside the Blackglass console. It
        scans your DigitalOcean, AWS, and GCP accounts for idle VMs, orphaned volumes, old
        snapshots, and similar costly junk — and lets you request cleanups through the same
        approval workflow we use for Linux drift events. People ask, reasonably:{" "}
        <em>why is a cloud waste tool inside a Linux integrity tool?</em> Here&rsquo;s the
        thinking.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Both questions live in the same job
      </h2>
      <p className="mt-3 leading-relaxed">
        The person who runs the Linux fleet is, in 90% of small-to-mid teams, also the person
        who answers for the cloud bill. They&rsquo;re the SRE, the platform engineer, the IT
        director — usually a one- or two-person function in a 30 – 200 person company.
        Configuration drift and unloved cloud resources are not the same problem, but they sit on
        the same desk.
      </p>
      <p className="mt-4 leading-relaxed">
        Both have the same shape: <em>silent accumulation of state nobody intended</em>. A drift
        event is a server slowly diverging from the configuration you approved. Cloud waste is a
        cloud account slowly diverging from the resource list you intended to pay for. Same
        operator, same calmer-than-the-category alerting model, same evidence-export pattern.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Why we didn&rsquo;t build it as a separate product
      </h2>
      <p className="mt-3 leading-relaxed">
        The obvious commercial answer would have been to spin Charon out as its own SKU with its
        own dashboard. We considered that and rejected it because:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">It&rsquo;d duplicate work for the operator.</strong>{" "}
          Two dashboards, two auth flows, two sets of webhooks. Nobody wants that for a tool
          they&rsquo;ll touch twice a week.
        </li>
        <li>
          <strong className="text-fg-primary">The data flows naturally between them.</strong> A
          host that disappears from your fleet should ideally raise &ldquo;was the cloud volume
          attached to it cleaned up?&rdquo; — that&rsquo;s a Charon question with a Blackglass
          trigger. Single product, single data graph.
        </li>
        <li>
          <strong className="text-fg-primary">It strengthens the upgrade story for Lab.</strong> The
          free tier gets <em>one read-only Charon-linked cloud account</em>. That&rsquo;s deliberate
          — the public{" "}
          <Link className="text-accent-blue hover:underline" href="/tools/cloud-waste-estimator">
            /tools/cloud-waste-estimator
          </Link>{" "}
          can convert into the real product without an immediate paywall, and Lab users see the
          dashboard view of their actual cloud resources as proof-of-value.
        </li>
        <li>
          <strong className="text-fg-primary">The competitive landscape supports it.</strong>{" "}
          Standalone cloud-cost tools (Vantage, CloudHealth, ProsperOps) are excellent at
          allocation and rightsizing — neither of which Charon does. We&rsquo;re explicitly the
          janitor: find waste, request cleanup, move on. The bundle is the moat.
        </li>
      </ul>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What Charon is — and isn&rsquo;t — careful about
      </h2>
      <p className="mt-3 leading-relaxed">
        The hardest design constraint was: <em>never delete the wrong thing</em>. Cloud waste tools
        that auto-delete inevitably nuke a developer&rsquo;s test environment that they&rsquo;d
        forgotten was important, and once is enough to lose all trust. So Charon is built around
        explicit human approval, with several safety patterns:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="text-fg-primary">Read-only by default.</strong> Initial setup grants
          inventory-read scope only. Live cleanup requires a separate, distinct credential and an
          explicit per-account opt-in.
        </li>
        <li>
          <strong className="text-fg-primary">Tag-based protect lists.</strong> Resources tagged{" "}
          <code>protect:true</code>, <code>env:prod</code>, or anything in your custom protect-tag
          list are excluded at scan time, not at delete time. Suppression is the wrong layer.
        </li>
        <li>
          <strong className="text-fg-primary">Idle-score thresholds.</strong> Findings below your
          configured score don&rsquo;t even surface in the dashboard. The default is conservative
          enough that &ldquo;Charon shows me a finding&rdquo; should already feel meaningful.
        </li>
        <li>
          <strong className="text-fg-primary">Cleanup is request-based, not auto.</strong> Even with
          a cleanup credential linked, Charon proposes; the operator approves. The audit log
          records both the proposal and the approval, with both timestamps.
        </li>
        <li>
          <strong className="text-fg-primary">Webhook envelope is versioned.</strong> Outbound scan
          webhooks carry an explicit schema version so consumers can pin to a known payload shape.
          We versioned this on day one because cloud-cost integrations break in expensive ways.
        </li>
      </ul>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        Why &ldquo;rough self-reported counts&rdquo; in the public estimator
      </h2>
      <p className="mt-3 leading-relaxed">
        The public{" "}
        <Link className="text-accent-blue hover:underline" href="/tools/cloud-waste-estimator">
          /tools/cloud-waste-estimator
        </Link>{" "}
        deliberately doesn&rsquo;t ask for cloud credentials. You enter rough counts (&ldquo;maybe
        20 idle droplets, ~5 TB of orphaned volumes&rdquo;), pick a per-provider band (low /
        medium / high cost assumption), and get a monthly waste range. No telemetry, no
        credentials, no sign-up.
      </p>
      <p className="mt-4 leading-relaxed">
        That&rsquo;s the right shape for the top of the funnel because the prospect we want to
        reach — the on-call SRE who suspects waste but doesn&rsquo;t have buy-in to evaluate
        another tool yet — won&rsquo;t paste a cloud credential into a marketing landing page from
        a vendor they don&rsquo;t know. The estimator gives them a defensible &ldquo;we&rsquo;re
        wasting between $X and $Y per month&rdquo; number to bring to their boss in 90 seconds.
        The conversion happens later, after the boss has signed off on a 14-day trial.
      </p>
      <p className="mt-4 leading-relaxed">
        This is the same reason{" "}
        <Link className="text-accent-blue hover:underline" href="/tools/cloud-inventory-diff">
          /tools/cloud-inventory-diff
        </Link>{" "}
        runs entirely client-side via FileReader — paste two JSON exports, see what changed,
        nothing leaves the browser. Trust posture matters more than feature parity for a
        free-tools surface.
      </p>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        What Charon costs — and why
      </h2>
      <p className="mt-3 leading-relaxed">
        Charon is a $99/month add-on across all paid tiers. Pricing rationale:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          The cleanups Charon surfaces typically save 10× – 100× the add-on cost in the first
          month. We don&rsquo;t want pricing to be the reason a customer doesn&rsquo;t take the
          win.
        </li>
        <li>
          $99 reads as &ldquo;clearly an add-on, not a platform&rdquo;. We don&rsquo;t want
          customers comparing Charon to Vantage at hundreds of dollars per month — they&rsquo;re
          different products solving different problems.
        </li>
        <li>
          A flat add-on (rather than a per-cloud-account meter) keeps the pricing page readable
          and means our incentives line up with the customer&rsquo;s. We don&rsquo;t want to
          benefit when you link a 10th cloud account; you do.
        </li>
      </ul>

      <h2 className="mt-12 text-xl font-semibold text-fg-primary">
        How it sits in the broader product story
      </h2>
      <p className="mt-3 leading-relaxed">
        Blackglass is fundamentally a tool that watches Linux servers for configuration drift and
        exports auditor-grade evidence. Charon is the recognition that the same operator has a
        second, related problem we can solve well in a fraction of the engineering surface — and
        that bundling them gives both products a stronger reason to exist than either would have
        alone.
      </p>
      <p className="mt-4 leading-relaxed">
        If you want to see Charon in the dashboard, the{" "}
        <Link className="text-accent-blue hover:underline" href="/demo">
          live demo workspace
        </Link>{" "}
        has a populated Janitor view. Or open the public{" "}
        <Link className="text-accent-blue hover:underline" href="/tools/cloud-waste-estimator">
          /tools/cloud-waste-estimator
        </Link>{" "}
        to see the same model on a no-credentials-required pass.
      </p>

      <div className="mt-12 rounded-card border border-accent-blue/40 bg-accent-blue/5 p-6">
        <h2 className="text-base font-semibold text-fg-primary">
          Try Charon (and the rest of Blackglass)
        </h2>
        <p className="mt-2 text-sm leading-relaxed">
          The free Lab tier includes one read-only Charon-linked cloud account. Live cleanups are a
          $99/mo add-on on any paid tier; 14-day trial covers everything, no card.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue-hover"
          >
            Open the demo workspace
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-border-default bg-bg-panel px-5 py-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
          >
            See pricing
          </Link>
        </div>
      </div>
    </main>
  );
}
