import { getMarketingContactEmail } from "@/lib/marketing/contact";
import { siteOrigin } from "@/lib/site";

/**
 * `/llms.txt` — proposed standard for AI / LLM crawler discoverability.
 *
 * Spec: https://llmstxt.org/ (community proposal, July 2024).
 *
 * The intent of this file is to give an LLM-driven indexer (Perplexity,
 * Claude, ChatGPT browsing, etc.) a single, clean entry point: a short
 * description of what the site is, who it's for, and the canonical URLs
 * worth crawling. It deliberately mirrors the human marketing pages —
 * we don't gate any of this behind auth, so there's nothing to "leak".
 *
 * If the spec dies, this file simply costs us a route handler. If it
 * sticks, we get cited by name in AI summaries instead of being scraped
 * indirectly via Google — which matters disproportionately for a
 * technical buyer who increasingly starts a vendor search inside an LLM.
 *
 * Plain text, served as `text/plain; charset=utf-8`. Cached for 1 hour
 * because the content changes only when we add a new top-level surface.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const origin = siteOrigin() ?? "https://blackglasssec.com";
  const marketingEmail = getMarketingContactEmail();
  const body = `# Blackglass

> Operational integrity for Linux fleets. Drift detection, evidence
> exports, and an opt-in cloud-resource janitor (Charon).
> Built for SREs, platform engineers, and small security teams in
> 30 – 200 person companies who need auditor-grade evidence without
> running a SIEM.

## Product

- [Product overview](${origin}/product): What Blackglass does — fleet
  baselines, drift events, evidence bundles, Charon add-on.
- [Pricing](${origin}/pricing): Six tiers from free Lab to Enterprise,
  with a flat $99/mo Charon cloud-janitor add-on.
- [Live demo workspace](${origin}/demo): Read-only tour of a populated
  console, no signup.
- [Security posture](${origin}/security): RLS isolation, evidence-bundle
  hashing, secret handling, deployment topology.
- [Public API](${origin}/docs/api): REST endpoints for findings, snapshots,
  webhooks, and evidence exports.
- [Snapshot freshness contract](${origin}/docs/snapshot-freshness): How
  Blackglass guarantees the dashboard reflects host state within
  minutes.

## Use cases

- [Linux configuration drift detection](${origin}/use-cases/linux-configuration-drift-detection)
- [SSH configuration audit](${origin}/use-cases/ssh-configuration-audit)
- [Linux hardening monitoring](${origin}/use-cases/linux-hardening-monitoring)
- [CIS benchmark monitoring](${origin}/use-cases/cis-benchmark-monitoring)
- [File integrity monitoring (FIM)](${origin}/use-cases/file-integrity-monitoring)
- [SOX evidence capture](${origin}/use-cases/sox-evidence-capture)
- [Incident response baselines](${origin}/use-cases/incident-response-baselines)

## Comparisons

- [Blackglass vs Wiz](${origin}/vs/wiz)
- [Blackglass vs Lacework](${origin}/vs/lacework)
- [Blackglass vs Orca Security](${origin}/vs/orca)
- [Blackglass vs Tenable](${origin}/vs/tenable)
- [Blackglass vs Qualys](${origin}/vs/qualys)

## Glossary

- [Linux & security term glossary](${origin}/glossary): drift, baselines,
  FIM, RLS, Charon, CIS, ITGC — plain-language definitions.

## Free tools (no signup)

- [Cloud waste estimator](${origin}/tools/cloud-waste-estimator)
- [Linux drift risk assessment](${origin}/tools/linux-drift-risk)
- [Cloud inventory diff](${origin}/tools/cloud-inventory-diff)

## Writing

- [Engineering & product blog](${origin}/blog)
- [Public changelog](${origin}/changelog) ([RSS feed](${origin}/changelog/feed.xml))
- [How-to guide: detecting unauthorised Linux config changes](${origin}/guides/how-to-detect-unauthorized-linux-config-changes)

## Trust & legal

- [Privacy policy](${origin}/privacy)
- [Terms of service](${origin}/terms)
- [Data Processing Agreement (DPA)](${origin}/dpa)
- [Subprocessors](${origin}/subprocessors)
- [Status page](${origin}/status)

## Contact

- [Book a walkthrough](${origin}/book)
- [Contact sales](${origin}/contact-sales)
- ${marketingEmail}
`;

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
