import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { VsLayout } from "@/components/marketing/VsLayout";

const PATH = "/vs/lacework";
const TITLE = "Blackglass vs Lacework: when to pick which (and when to use both)";
const DESCRIPTION =
  "Honest comparison of Blackglass and Lacework for Linux teams. Lacework's Polygraph is strong on cloud anomaly detection; Blackglass focuses on deterministic in-server configuration drift with auditor-grade evidence.";

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
      title: "Blackglass vs Lacework",
      subtitle: "Anomaly scoring vs deterministic drift evidence",
    }),
  },
};

export default function BlackglassVsLaceworkPage() {
  return (
    <>
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/vs" },
          { name: "Blackglass vs Lacework", url: PATH },
        ])}
      />
      <VsLayout
        competitorName="Lacework"
        competitorPositioning="Data-driven cloud security platform built around the Polygraph behavioural model. Detects cloud and workload anomalies by learning baselines and surfacing deviations, plus host vulnerability management and container security."
        blackglassPositioning="Server-side configuration integrity for Linux fleets. Captures explicit baselines you approve, detects every drift event against them, and exports per-line evidence — deterministic, not behavioural."
        relationship="Lacework's Polygraph is at its best when you want a single tool watching for unknown-unknowns across cloud workloads — anomaly scoring across runtime telemetry. Blackglass takes the opposite approach for the in-server question: capture a baseline you trust, then alert on any deviation, full stop. The two coexist well because they answer different questions: 'what looks weird?' vs 'what changed since I approved this server?'."
        comparison={[
          {
            capability: "Detection model",
            competitor:
              "Behavioural / anomaly-based — Polygraph learns what's normal and flags deviations from learned baselines.",
            blackglass:
              "Deterministic — operator captures an approved baseline; every change is a drift event, with severity tagged from a finite policy library.",
          },
          {
            capability: "Primary scope",
            competitor:
              "Cloud accounts + container runtime + Linux workload telemetry. Strong cloud-side coverage (AWS, Azure, GCP).",
            blackglass:
              "Linux servers, on-disk config state. Cloud resource hygiene available via the optional Charon add-on (DigitalOcean, AWS, GCP).",
          },
          {
            capability: "Audit evidence",
            competitor:
              "Polygraph-based findings; exports available but tied to behavioural scoring and learned baselines.",
            blackglass:
              "Per-host PDF + JSON evidence bundles tied to operator-approved baselines. Designed to hand to an external auditor without further interpretation.",
          },
          {
            capability: "Linux-specific drift checks",
            competitor:
              "Vulnerability and runtime behaviour focus — not designed to enumerate every sshd_config / sudoers / package change.",
            blackglass:
              "Primary use case — sshd_config, sudoers, services, packages, file integrity, hardening profile, all with per-line diff and CIS alignment.",
          },
          {
            capability: "Alert posture",
            competitor:
              "Severity scoring driven by Polygraph; tunable but inherently probabilistic.",
            blackglass:
              "Drift-based — every change has a deterministic severity from policy. Calmer dashboards by design; no anomaly score to interpret.",
          },
          {
            capability: "Pricing posture",
            competitor:
              "Enterprise sales motion; per-workload pricing typically discussed under NDA.",
            blackglass:
              "Public price ladder from $59/mo (Starter, 15 hosts) up to a $2,500/mo Enterprise anchor. Free Lab tier and a 14-day trial without a card.",
          },
          {
            capability: "Air-gap / self-hosted",
            competitor:
              "Primarily SaaS; on-prem agents available but central platform is cloud-hosted.",
            blackglass:
              "Self-hosted Helm chart, BYOK encryption with rotation, and an air-gap probe wired in for fully disconnected deployments.",
          },
        ]}
        pickCompetitor={{
          heading: "Pick Lacework when",
          bullets: [
            "Your security team prefers behavioural / anomaly detection over deterministic policy.",
            "Cloud-runtime telemetry across many workloads is your primary concern.",
            "You want a single tool to span cloud security posture + workload runtime + image scanning, and you're comfortable with anomaly-style severity.",
            "You have the analyst capacity to triage probabilistic findings and tune Polygraph baselines over time.",
          ],
        }}
        pickBlackglass={{
          heading: "Add (or pick) Blackglass when",
          bullets: [
            "Auditors or change-control reviewers want explicit, per-line evidence — not anomaly scores.",
            "Your fleet is long-lived Linux servers where the question is 'what changed since I approved this?' not 'what looks unusual right now?'.",
            "You need a calmer dashboard your platform / IT team can actually keep on top of without dedicated security analysts.",
            "You operate air-gapped or self-hosted environments Lacework can't reach.",
            "Your budget for in-server visibility is $59 – $2,500 per month, not enterprise platform pricing.",
            "You want the optional Charon cloud-waste cleanup as a side benefit at no extra platform cost.",
          ],
        }}
        lastReviewed="May 2026"
        sources={[
          { label: "Lacework product page", href: "https://www.lacework.com/platform" },
          { label: "Polygraph data platform", href: "https://www.lacework.com/platform/polygraph" },
          { label: "Blackglass product page", href: "https://blackglasssec.com/product" },
        ]}
        relatedComparisons={[
          { href: "/vs/wiz", label: "Blackglass vs Wiz" },
          { href: "/vs/orca", label: "Blackglass vs Orca Security" },
          { href: "/vs/tenable", label: "Blackglass vs Tenable" },
          { href: "/vs/qualys", label: "Blackglass vs Qualys" },
        ]}
      />
    </>
  );
}
