import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { VsLayout } from "@/components/marketing/VsLayout";

const PATH = "/vs/orca";
const TITLE = "Blackglass vs Orca Security: when to pick which (and when to use both)";
const DESCRIPTION =
  "Honest comparison of Blackglass and Orca Security for Linux teams. Orca's SideScanning gives broad agentless cloud visibility; Blackglass watches in-server configuration state agentless can't reach by definition.";

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
      title: "Blackglass vs Orca Security",
      subtitle: "Agentless cloud snapshots vs in-server drift evidence",
    }),
  },
};

export default function BlackglassVsOrcaPage() {
  return (
    <>
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/vs" },
          { name: "Blackglass vs Orca Security", url: PATH },
        ])}
      />
      <VsLayout
        competitorName="Orca Security"
        competitorPositioning="Cloud security platform built around SideScanning — agentless snapshots of cloud workloads and storage to surface misconfigurations, vulnerabilities, exposed secrets, and identity risk across major clouds."
        blackglassPositioning="Server-side configuration integrity for Linux fleets. Captures trusted baselines per host, detects every drift event against them, and exports auditor-readable evidence — including for hosts Orca's snapshot model can't see."
        relationship="Orca's SideScanning is excellent at giving a single, near-complete view of your cloud without installing anything on workloads. The trade-off: agentless can only see what's in the snapshot, not what changes between snapshots, and it can't reach hosts outside the snapshot perimeter (on-prem, edge, air-gapped). Blackglass picks up exactly there — continuous in-server visibility with every drift event captured against an operator-approved baseline."
        comparison={[
          {
            capability: "Collection model",
            competitor:
              "Agentless SideScanning — periodic snapshots of cloud workload disks and storage analysed out-of-band.",
            blackglass:
              "SSH pull, push agent (systemd timer / cron), or hybrid. Continuous between scans, not snapshot-bounded.",
          },
          {
            capability: "Coverage scope",
            competitor:
              "Cloud workloads (AWS, Azure, GCP, OCI, Kubernetes). Limited or no coverage for on-prem, edge, or air-gapped Linux.",
            blackglass:
              "Any Linux host reachable by SSH or running the push agent — cloud, on-prem, edge, or air-gapped (self-hosted Helm chart).",
          },
          {
            capability: "Linux configuration drift detection",
            competitor:
              "Snapshot-time view — sees the state at scan, not the change history. Not designed to surface every sshd_config / sudoers edit between snapshots.",
            blackglass:
              "Primary use case — every drift event captured with severity, timestamp, and per-line diff against an approved baseline.",
          },
          {
            capability: "Identity, IAM, attack paths",
            competitor:
              "Strong — cloud-native attack-path analysis, identity risk, exposure scoring across the cloud graph.",
            blackglass:
              "Out of scope. Charon add-on covers idle / orphaned cloud resources but does not analyse IAM or attack paths.",
          },
          {
            capability: "Compliance evidence",
            competitor:
              "Maps findings to CIS, NIST, PCI, SOC 2, and similar frameworks with cloud-side controls.",
            blackglass:
              "Per-host evidence exports (PDF + JSON) tied to baseline approval — designed for SOX-style change-control evidence and CIS Linux benchmarks.",
          },
          {
            capability: "Pricing posture",
            competitor:
              "Enterprise sales motion; per-workload or per-asset pricing typically discussed under NDA.",
            blackglass:
              "Public price ladder from $59/mo (Starter, 15 hosts) up to a $2,500/mo Enterprise anchor. Free Lab tier and a 14-day trial without a card.",
          },
          {
            capability: "Air-gap / self-hosted",
            competitor:
              "SaaS; coverage outside the cloud perimeter is limited by the SideScanning model.",
            blackglass:
              "Self-hosted Helm chart, BYOK encryption with rotation, and an air-gap probe for fully disconnected deployments.",
          },
        ]}
        pickCompetitor={{
          heading: "Pick Orca when",
          bullets: [
            "Your fleet is overwhelmingly cloud-native and you want a single tool with broad agentless coverage.",
            "Cloud attack-path analysis and identity risk are top of your concern list.",
            "You prefer no agents on workloads and accept snapshot-time visibility as the trade-off.",
            "You're running an enterprise CNAPP procurement and want one platform for cloud-side findings.",
          ],
        }}
        pickBlackglass={{
          heading: "Add (or pick) Blackglass when",
          bullets: [
            "You need to know about every change inside a Linux server — not just the state at the last snapshot.",
            "Your fleet includes hosts outside Orca's snapshot perimeter: on-prem, edge boxes, air-gapped, customer-deployed.",
            "Auditors want per-line drift evidence with operator approval timestamps, not snapshot-time posture summaries.",
            "Your team is platform / SRE / IT, not cloud security, and a calmer drift-based dashboard fits how you actually work.",
            "Your budget for in-server visibility is $59 – $2,500 per month, not enterprise CNAPP pricing.",
            "You want optional cloud-waste cleanup (Charon) as a side benefit at no extra platform cost.",
          ],
        }}
        lastReviewed="May 2026"
        sources={[
          { label: "Orca Security platform overview", href: "https://orca.security/platform/" },
          { label: "Orca SideScanning explained", href: "https://orca.security/platform/sidescanning-technology/" },
          { label: "Blackglass product page", href: "https://blackglasssec.com/product" },
        ]}
      />
    </>
  );
}
