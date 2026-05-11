import type { Metadata } from "next";
import Link from "next/link";
import { canonical, defaultOgImages, defaultTwitterImages } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Snapshot freshness · Blackglass docs",
  description:
    "How Blackglass keeps host snapshots fresh, how the SSH-fail fallback waits for the next push-agent snapshot, and how to tune the cadence for your fleet.",
  alternates: { canonical: canonical("/docs/snapshot-freshness") },
  openGraph: {
    title: "Snapshot freshness · Blackglass docs",
    description:
      "How Blackglass keeps host snapshots fresh and how the SSH-fail fallback waits for the next push-agent snapshot.",
    type: "article",
    siteName: "Blackglass",
    url: canonical("/docs/snapshot-freshness"),
    images: defaultOgImages(),
  },
  twitter: {
    card: "summary_large_image",
    title: "Snapshot freshness · Blackglass docs",
    description:
      "How Blackglass keeps host snapshots fresh and how the SSH-fail fallback waits for the next push-agent snapshot.",
    images: defaultTwitterImages(),
  },
};

export default function SnapshotFreshnessDocsPage() {
  return (
    <main className="guide-article mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Docs</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
        Snapshot freshness model
      </h1>
      <p className="mt-4 text-sm text-fg-faint">
        ~6 min read · how Blackglass decides when host data is &ldquo;current enough&rdquo;
      </p>

      <p className="mt-6 text-lg leading-relaxed">
        Drift detection is only useful if the snapshot you&rsquo;re comparing against
        reality is actually current. This page explains how Blackglass keeps snapshots
        fresh in three different network shapes — direct SSH, push-agent, and a hybrid
        of the two — and how to tune the cadence for your fleet.
      </p>

      <nav aria-label="Table of contents" className="mt-8 rounded-lg border border-border-default bg-bg-panel p-4 text-sm">
        <p className="font-semibold text-fg-primary">Contents</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-fg-muted">
          <li><a href="#two-paths" className="hover:text-accent-blue hover:underline">Two collection paths: SSH-pull and agent-push</a></li>
          <li><a href="#freshness-pill" className="hover:text-accent-blue hover:underline">The freshness pill on the dashboard</a></li>
          <li><a href="#wait-for-push" className="hover:text-accent-blue hover:underline">How &ldquo;Run scan&rdquo; waits for fresh data</a></li>
          <li><a href="#tuning" className="hover:text-accent-blue hover:underline">Tuning the cadence</a></li>
          <li><a href="#troubleshooting" className="hover:text-accent-blue hover:underline">Troubleshooting stale snapshots</a></li>
        </ol>
      </nav>

      <h2 id="two-paths" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
        1. Two collection paths: SSH-pull and agent-push
      </h2>
      <p className="mt-4 leading-relaxed">
        Every host snapshot Blackglass evaluates comes from one of two paths. They have
        very different freshness profiles.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-6 leading-relaxed">
        <li>
          <strong className="text-fg-primary">SSH-pull (interactive).</strong> When you click <em>Run scan</em>,
          Blackglass tries to SSH directly into each host and capture the snapshot in real
          time. If SSH succeeds, the snapshot is &ldquo;as of right now.&rdquo;
        </li>
        <li>
          <strong className="text-fg-primary">Agent-push (continuous).</strong> The push-agent installed on each
          host captures a snapshot on a timer (default 60 seconds) and posts it to the
          ingest API. Blackglass keeps the most recent push per host in an in-memory
          cache. If SSH fails (NAT, air-gap, key rotation, paid SSH gateway down), the
          collector falls back to the cached push.
        </li>
      </ul>
      <p className="mt-4 leading-relaxed">
        For most fleets one path dominates: cloud VMs with public SSH live on the
        SSH-pull path; Droplets behind NAT, on-prem servers, and DigitalOcean App
        Platform &rarr; private hosts live on the agent-push path. Blackglass uses
        whichever path returns a usable snapshot first, with SSH-pull preferred.
      </p>

      <h2 id="freshness-pill" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
        2. The freshness pill on the dashboard
      </h2>
      <p className="mt-4 leading-relaxed">
        Next to the <em>Run scan</em> button on your dashboard, the freshness pill
        shows how recent the latest signal across the fleet is. The thresholds are:
      </p>
      <ul className="mt-4 space-y-2 leading-relaxed">
        <li><span className="inline-block rounded-md border border-success/40 bg-success-soft/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">Green</span> &mdash; latest snapshot &le; 90 seconds old. Healthy.</li>
        <li><span className="inline-block rounded-md border border-warning/40 bg-warning-soft/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">Amber</span> &mdash; 90s &lt; latest &le; 5 min. The agent may be on the longer (legacy) cadence, or one host has dropped off briefly.</li>
        <li><span className="inline-block rounded-md border border-danger/40 bg-danger-soft/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger">Red</span> &mdash; latest &gt; 5 min. Investigate: agent timer disabled, hosts offline, or ingest credentials wrong.</li>
      </ul>
      <p className="mt-4 leading-relaxed">
        The pill is a <em>fleet-wide</em> max — it summarises the freshest signal anywhere
        in your fleet. To see per-host freshness, open <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">Hosts &rarr; (any host) &rarr; Last seen</code>.
      </p>

      <h2 id="wait-for-push" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
        3. How &ldquo;Run scan&rdquo; waits for fresh data
      </h2>
      <p className="mt-4 leading-relaxed">
        The most common confusing case: you change a config on a host, click <em>Run
        scan</em> immediately, and want the new state — but SSH is unreachable and the
        cached agent snapshot is from 30 seconds <em>before</em> your change.
      </p>
      <p className="mt-4 leading-relaxed">
        Blackglass handles this with a bounded wait. When the collector falls back to
        the agent cache and finds a snapshot older than your <em>Run scan</em> click,
        it polls the cache up to <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">COLLECTOR_AGENT_FRESH_WAIT_MS</code> (default 90s)
        for a newer push to arrive. While it waits, the scan-progress card shows a live
        countdown (&ldquo;Waiting for fresh agent snapshot (47s remaining)&hellip;&rdquo;) so
        you know the scan isn&rsquo;t stalled.
      </p>
      <p className="mt-4 leading-relaxed">
        Combined with the 60-second default agent cadence, this means the worst case
        for &ldquo;Run scan after a manual change&rdquo; on a blackholed host is
        roughly 60–90 seconds, not 5 minutes.
      </p>

      <h2 id="tuning" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
        4. Tuning the cadence
      </h2>
      <p className="mt-4 leading-relaxed">
        Three knobs control freshness, all environment variables on the server (no
        agent restart required for the wait knob):
      </p>
      <div className="mt-4 overflow-x-auto rounded-card border border-border-default">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-bg-input/40 text-xs uppercase tracking-wider text-fg-faint">
            <tr>
              <th className="px-4 py-2 font-medium">Variable</th>
              <th className="px-4 py-2 font-medium">Default</th>
              <th className="px-4 py-2 font-medium">What it controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default text-xs">
            <tr>
              <td className="px-4 py-2 font-mono text-fg-primary">Agent push interval</td>
              <td className="px-4 py-2">60s</td>
              <td className="px-4 py-2">How often the host pushes a fresh snapshot. Configured on the host&rsquo;s systemd timer (<code className="rounded bg-bg-input px-1 py-0.5">blackglass-agent.timer</code>) or cron entry.</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-mono text-fg-primary">COLLECTOR_AGENT_FRESH_WAIT_MS</td>
              <td className="px-4 py-2">90,000</td>
              <td className="px-4 py-2">Max time the SSH-fail fallback waits for a newer push than the user&rsquo;s <em>Run scan</em> click. Set to 0 to disable waiting and always use the freshest cached snapshot immediately.</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-mono text-fg-primary">COLLECTOR_AGENT_FRESH_POLL_MS</td>
              <td className="px-4 py-2">1,500</td>
              <td className="px-4 py-2">How often the wait loop re-checks the cache while waiting. Lower = snappier countdown, higher = less CPU on busy boxes.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 leading-relaxed">
        For the lowest possible &ldquo;time-to-detect&rdquo; on blackholed hosts, set the
        agent timer to 30 seconds and leave <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">COLLECTOR_AGENT_FRESH_WAIT_MS</code>{" "}
        at the default. Going below 30 seconds for the agent timer is rarely worth the
        extra ingest cost.
      </p>

      <h2 id="troubleshooting" className="mt-14 text-xl font-semibold text-fg-primary scroll-mt-20">
        5. Troubleshooting stale snapshots
      </h2>
      <p className="mt-4 leading-relaxed">
        If the freshness pill stays amber or red:
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-6 leading-relaxed">
        <li>
          On the host, check the systemd timer:
          <pre className="mt-2 overflow-x-auto rounded-card border border-border-default bg-bg-input/50 p-3 text-xs"><code>{`systemctl status blackglass-agent.timer
journalctl -u blackglass-agent.service -n 50 --no-pager`}</code></pre>
        </li>
        <li>
          Verify the agent reaches your console:
          <pre className="mt-2 overflow-x-auto rounded-card border border-border-default bg-bg-input/50 p-3 text-xs"><code>{`curl -sI https://blackglasssec.com/api/agents/health
# Expect: HTTP/2 200`}</code></pre>
        </li>
        <li>
          If the agent shows a 401 / 403, the per-host ingest secret has rotated. Re-run the install
          script — it&rsquo;ll mint a new key and replace the old one.
        </li>
        <li>
          If you can SSH to the host but the agent isn&rsquo;t pushing, the timer is most likely disabled
          (<code className="rounded bg-bg-input px-1 py-0.5">systemctl enable --now blackglass-agent.timer</code>).
        </li>
      </ol>

      <hr className="my-12 border-border-default" />

      <p className="text-sm text-fg-muted">
        Still seeing stale data? <Link className="text-accent-blue hover:underline" href="/contact-sales">Get in touch</Link>{" "}
        and include your fleet size + a snippet of the agent journal — we&rsquo;ll dig in.
      </p>
    </main>
  );
}
