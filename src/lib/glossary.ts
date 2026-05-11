/**
 * Glossary entries for `/glossary` — long-tail definitions for terms we use
 * across marketing, docs, and blog posts. Keep definitions aligned with
 * in-product language; link to deeper pages where they exist.
 */

export interface GlossaryEntry {
  readonly slug: string;
  readonly term: string;
  /** 2–4 sentences, plain language. */
  readonly definition: string;
  /** Optional internal links for topical clustering. */
  readonly related?: ReadonlyArray<{ href: string; label: string }>;
}

export const GLOSSARY_ENTRIES: ReadonlyArray<GlossaryEntry> = [
  {
    slug: "configuration-drift",
    term: "Configuration drift",
    definition:
      "The gradual (or sudden) divergence of a live system from an approved or expected state — new packages, changed sshd settings, altered sudo rules, or new listeners. Blackglass treats drift as a first-class signal with severity and evidence, not as noise buried in logs.",
    related: [
      { href: "/use-cases/linux-configuration-drift-detection", label: "Drift detection use case" },
      { href: "/glossary#baseline-snapshot", label: "Baseline snapshot" },
    ],
  },
  {
    slug: "baseline-snapshot",
    term: "Baseline snapshot",
    definition:
      "A point-in-time capture of a host's security-relevant configuration that your team explicitly marks as trusted. Every later scan diffs against the active baseline so 'change' always means 'change from what we approved'.",
    related: [
      { href: "/product", label: "Product tour" },
      { href: "/glossary#configuration-drift", label: "Configuration drift" },
    ],
  },
  {
    slug: "file-integrity-monitoring",
    term: "File integrity monitoring (FIM)",
    definition:
      "Detecting unauthorised changes to critical files — typically via cryptographic hashes — so tampering with binaries, configs, or boot scripts surfaces quickly. Blackglass includes FIM-style signals as part of a broader drift model rather than as a standalone noisy alert stream.",
    related: [{ href: "/use-cases/file-integrity-monitoring", label: "FIM use case" }],
  },
  {
    slug: "cis-benchmark",
    term: "CIS benchmark",
    definition:
      "Center for Internet Security published hardening guidance and scored checks for operating systems and software. Blackglass helps teams stay close to CIS Linux expectations between formal audits by alerting when real hosts slip from the posture you captured.",
    related: [{ href: "/use-cases/cis-benchmark-monitoring", label: "CIS monitoring use case" }],
  },
  {
    slug: "row-level-security",
    term: "Row-level security (RLS)",
    definition:
      "A database enforcement pattern where every query automatically filters rows to the current tenant's data. Blackglass uses Postgres RLS so application bugs cannot accidentally cross tenant boundaries — bypasses are rare, audited, and tagged in code.",
    related: [
      { href: "/security", label: "Security overview" },
      { href: "/blog/row-level-security-tenant-isolation", label: "Engineering blog: RLS" },
    ],
  },
  {
    slug: "evidence-bundle",
    term: "Evidence bundle",
    definition:
      "An exportable package (PDF + structured JSON) that ties drift findings, baseline metadata, and operator actions into a single artefact suitable for auditors, customers, or post-incident review.",
    related: [{ href: "/use-cases/sox-evidence-capture", label: "SOX evidence use case" }],
  },
  {
    slug: "charon",
    term: "Charon",
    definition:
      "Blackglass's optional cloud-resource hygiene module: read-only inventory across linked cloud accounts, idle-resource detection, and human-approved cleanup requests — bundled in the same console as Linux drift.",
    related: [
      { href: "/blog/charon-design-rationale", label: "Why Charon exists" },
      { href: "/tools/cloud-waste-estimator", label: "Cloud waste estimator" },
    ],
  },
  {
    slug: "snapshot-freshness",
    term: "Snapshot freshness",
    definition:
      "How current the dashboard's view of a host is relative to the last successful scan. Blackglass documents expected maximum lag per deployment mode so teams can trust timestamps during incidents and audits.",
    related: [{ href: "/docs/snapshot-freshness", label: "Snapshot freshness doc" }],
  },
  {
    slug: "remediator",
    term: "Remediator",
    definition:
      "Optional human-in-the-loop remediation assistant that proposes fix plans for drift, validates them in a sandbox where configured, and never applies changes to production without explicit operator approval.",
    related: [{ href: "/pricing", label: "Pricing & FAQ" }],
  },
  {
    slug: "side-scanning",
    term: "Side-scanning (agentless cloud)",
    definition:
      "A cloud vendor technique that reads workload state from storage snapshots without an in-guest agent — excellent breadth, but inherently snapshot-time and blind to some in-server configuration nuances. Often complementary to Blackglass's inside-the-OS view.",
    related: [{ href: "/vs/orca", label: "Blackglass vs Orca" }],
  },
  {
    slug: "cnapp",
    term: "CNAPP",
    definition:
      "Cloud-Native Application Protection Platform — an umbrella category covering CSPM, CIEM, CWPP, and related cloud controls. Blackglass is not a CNAPP; it specialises in Linux configuration integrity while CNAPPs focus on cloud control-plane risk.",
    related: [{ href: "/vs/wiz", label: "Blackglass vs Wiz" }],
  },
  {
    slug: "itgc",
    term: "ITGC (IT general controls)",
    definition:
      "Controls over IT systems that support financial reporting integrity — change management, access, operations. Blackglass evidence exports are often used as supplementary ITGC artefacts for server configuration change review.",
    related: [{ href: "/use-cases/sox-evidence-capture", label: "SOX evidence use case" }],
  },
];