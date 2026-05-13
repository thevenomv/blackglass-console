import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { VsLayout } from "@/components/marketing/VsLayout";

const PATH = "/vs/wazuh";
const TITLE = "Blackglass vs Wazuh: when to pick which (and when to use both)";
const DESCRIPTION =
  "Honest comparison of Blackglass and Wazuh for Linux teams. Wazuh is a powerful open-source SIEM/XDR with broad coverage; Blackglass focuses on baseline-first Linux configuration drift with auditor-grade evidence.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: canonical(PATH) },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "article",
    siteName: "Blackglass",
    url: canonical(PATH),
    images: dynamicOgImages({
      title: "Blackglass vs Wazuh",
      subtitle: "Baseline-first drift evidence vs open-source SIEM/XDR",
    }),
  },
};

export default function BlackglassVsWazuhPage() {
  return (
    <>
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/vs" },
          { name: "Blackglass vs Wazuh", url: PATH },
        ])}
      />
      <VsLayout
        competitorName="Wazuh"
        competitorPositioning="Open-source unified XDR and SIEM platform. Provides log analysis, file integrity monitoring (FIM), vulnerability detection, policy compliance (PCI DSS, HIPAA, CIS), intrusion detection, and cloud workload security across Linux, Windows, and macOS endpoints."
        blackglassPositioning="Server-side configuration integrity for Linux fleets. Captures explicit approved baselines per host, detects every drift event against them (sshd, sudoers, packages, services, hardening), and exports per-line auditor-readable evidence. No SIEM. No log pipeline."
        relationship="Wazuh is a broad-spectrum security platform — it ingests logs, runs HIDS, checks compliance rules, and ships alerts to a central SIEM. Blackglass does exactly one thing: baseline-first Linux configuration drift with evidence you can hand to an auditor without further processing. Teams that run Wazuh often add Blackglass when auditors ask for deterministic, approved-baseline evidence rather than rule-match logs. The two can coexist — Wazuh keeps the runtime stream; Blackglass keeps the approved-state record."
        comparison={[
          {
            capability: "Detection model",
            competitor:
              "Rule-based and signature-driven HIDS + FIM: alerts when a watched file changes or a known-bad pattern is matched. Policy compliance checks run against a library of CIS / PCI / HIPAA rules on a schedule.",
            blackglass:
              "Baseline-first: operator captures an approved configuration state per host; every deviation from that state is a drift event — deterministic, fully auditable, zero rule-authoring required.",
          },
          {
            capability: "File integrity monitoring",
            competitor:
              "FIM on user-defined path lists (inotify / audit daemon). Alerts when content hash or permissions change. Requires you to define which paths to watch.",
            blackglass:
              "Monitors the full in-scope configuration surface per host (sshd_config, sudoers, PAM, packages, services, hardening) against an approved snapshot. Captures per-line diffs, not just hash changes.",
          },
          {
            capability: "Baseline concept",
            competitor:
              "No explicit 'approved baseline' — Wazuh compares to known-good rules or a previous-state hash. Change-approval workflow lives in your change management tooling, not Wazuh.",
            blackglass:
              "Central concept. Every host has an operator-approved baseline. Drift = deviation from approved. The baseline is versioned, timestamped, and exportable.",
          },
          {
            capability: "Audit evidence output",
            competitor:
              "Alerts and log events queryable in the Wazuh dashboard / ELK / OpenSearch. Compliance dashboards show rule-pass/fail counts. Evidence typically requires dashboards export and post-processing for an auditor.",
            blackglass:
              "Per-host evidence bundles (PDF + JSONL) with baseline snapshot, per-line drift diffs, severity tagging, and approval timestamps. Designed to land on an auditor's desk without further interpretation.",
          },
          {
            capability: "Operational cost",
            competitor:
              "Self-hosted: significant infrastructure (indexer, server, dashboard), tuning overhead, rule maintenance, storage planning for log retention. Wazuh Cloud offloads infra but keeps the tuning burden.",
            blackglass:
              "Cloud SaaS or self-hosted Helm chart. No indexer, no log pipeline, no rule tuning. Onboarding: connect a host, capture a baseline, done.",
          },
          {
            capability: "Scope beyond Linux config",
            competitor:
              "Strong: Windows, macOS, cloud workloads, network devices (syslog), log aggregation, vulnerability correlation, active response scripts.",
            blackglass:
              "Linux-only configuration drift. Optional Charon add-on for cloud resource hygiene. Not a SIEM or log aggregation platform.",
          },
          {
            capability: "Pricing model",
            competitor:
              "Open source (self-managed, free). Wazuh Cloud SaaS starts from ~$400/mo for 25 agents.",
            blackglass:
              "Public price ladder from $59/mo (Starter, 15 hosts) to $2,500/mo Enterprise anchor. Free Lab tier and 14-day trial without a card.",
          },
        ]}
        pickCompetitor={{
          heading: "Pick Wazuh when",
          bullets: [
            "You need a unified SIEM/XDR covering logs, HIDS, and alerting across Linux, Windows, macOS, and cloud workloads.",
            "Your SOC needs a centralised alert stream, active response, and security event correlation.",
            "You want open-source, self-hosted, with full control over the rule library and retention.",
            "Compliance requirements map well to Wazuh's built-in PCI DSS, HIPAA, GDPR, or NIST rule packs.",
            "Budget is constrained and 'free and self-managed' is a hard requirement.",
          ],
        }}
        pickBlackglass={{
          heading: "Add (or pick) Blackglass when",
          bullets: [
            "You need an approved-baseline record that survives a SOC 2 or CIS audit — Wazuh FIM alerts show change events; Blackglass shows deviation from a state you formally approved.",
            "Your auditor is asking 'show me every change to sshd and sudoers since baseline, with who approved it' — not 'show me your SIEM alerts'.",
            "You want per-line configuration diffs, not file-hash change notifications.",
            "Your Linux fleet has no Windows/macOS — you don't need Wazuh's breadth.",
            "You want zero infra overhead: no indexer, no log pipeline, no rule tuning.",
            "Your budget for in-server drift evidence is $59 – $2,500 per month, not a full SIEM infrastructure investment.",
          ],
        }}
        lastReviewed="May 2026"
        sources={[
          { label: "Wazuh product overview", href: "https://wazuh.com/platform/overview/" },
          { label: "Wazuh FIM documentation", href: "https://documentation.wazuh.com/current/user-manual/capabilities/file-integrity/index.html" },
          { label: "Wazuh Cloud pricing", href: "https://wazuh.com/cloud/" },
          { label: "Blackglass product page", href: "https://blackglasssec.com/product" },
        ]}
        relatedComparisons={[
          { href: "/vs/tenable", label: "Blackglass vs Tenable" },
          { href: "/vs/qualys", label: "Blackglass vs Qualys" },
          { href: "/vs/sentinelone", label: "Blackglass vs SentinelOne" },
          { href: "/vs/wiz", label: "Blackglass vs Wiz" },
        ]}
      />
    </>
  );
}
