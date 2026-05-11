import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { VsLayout } from "@/components/marketing/VsLayout";

const PATH = "/vs/wiz";
const TITLE = "Blackglass vs Wiz: when to pick which (and when to use both)";
const DESCRIPTION =
  "Honest comparison of Blackglass and Wiz for Linux teams. Wiz is a cloud-native CNAPP for posture and identity; Blackglass watches the configuration state inside each Linux server. Most teams run both.";

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
      title: "Blackglass vs Wiz",
      subtitle: "When to pick which · in-server vs cloud-posture coverage",
    }),
  },
};

export default function BlackglassVsWizPage() {
  return (
    <>
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/vs" },
          { name: "Blackglass vs Wiz", url: PATH },
        ])}
      />
      <VsLayout
        competitorName="Wiz"
        competitorPositioning="Cloud-native application protection platform (CNAPP) covering CSPM, CWPP, CIEM, and DSPM across major clouds. Agentless scanning of cloud accounts to surface misconfigurations, exposed secrets, identity risk, and vulnerable workloads."
        blackglassPositioning="Server-side configuration integrity for Linux fleets. Captures trusted baselines per host, detects every drift event against them (sshd, sudoers, packages, services, hardening), and exports auditor-readable evidence. Optional Charon add-on for cloud resource hygiene."
        relationship="Wiz looks at the shape of your cloud — accounts, identities, network paths, vulnerable images. Blackglass looks at the configuration state inside each Linux server. They overlap on a thin band (vulnerability of installed packages) and complement each other everywhere else. Most prospects keep their Wiz subscription and add Blackglass for the in-server visibility Wiz's agentless scanner can't reach."
        comparison={[
          {
            capability: "Primary scope",
            competitor:
              "Cloud accounts: AWS, Azure, GCP, OCI. Looks at cloud control-plane state, identity graphs, network exposure, container images.",
            blackglass:
              "Linux servers (any deployment shape — cloud, on-prem, hybrid, air-gapped). Looks at on-disk configuration files, sshd, sudoers, packages, services, file integrity.",
          },
          {
            capability: "Deployment model",
            competitor: "Agentless cloud snapshots; read-only IAM role per cloud account.",
            blackglass:
              "Three modes: SSH pull, push agent (systemd timer / cron), or hybrid. Self-hosted and air-gap friendly with the Helm chart.",
          },
          {
            capability: "Linux configuration drift detection",
            competitor:
              "Limited — agentless scans see image-level vulnerabilities and runtime posture, not granular sshd_config or sudoers changes between scans.",
            blackglass:
              "Primary use case. Every drift event is captured against an approved baseline with severity, timestamp, and per-line diff.",
          },
          {
            capability: "Identity & cloud posture",
            competitor:
              "Strong: full CIEM, attack-path analysis, secrets discovery, IaC scanning, container registry coverage.",
            blackglass:
              "Out of scope. Charon add-on covers idle / orphaned cloud resources but does not perform IAM analysis.",
          },
          {
            capability: "Compliance evidence",
            competitor:
              "Maps findings to common frameworks (CIS, NIST, PCI, SOC 2) with cloud-side controls.",
            blackglass:
              "Per-host evidence exports (PDF + JSON) tied to baseline approval — auditor-readable and signed. CIS Linux benchmark alignment.",
          },
          {
            capability: "Pricing posture",
            competitor:
              "Enterprise sales motion; per-workload or per-cloud-account pricing typically discussed under NDA.",
            blackglass:
              "Public price ladder from $59/mo (Starter, 15 hosts) up to a $2,500/mo Enterprise anchor. Free Lab tier and a 14-day trial without a card.",
          },
          {
            capability: "Time to first signal",
            competitor:
              "Hours-to-days after IAM role grant — agentless scan needs to enumerate the cloud account.",
            blackglass:
              "Minutes — onboarding wizard captures a baseline on first scan; drift surfaces on the next push or scheduled scan.",
          },
        ]}
        pickCompetitor={{
          heading: "Pick Wiz when",
          bullets: [
            "Your top concern is cloud-side posture: IAM, attack paths, exposed secrets, public buckets, vulnerable container images.",
            "You operate at multi-cloud scale and need a unified view across hundreds of accounts.",
            "You're already in an enterprise CNAPP procurement cycle and need a single vendor for cloud-side findings.",
            "Most of your workloads are managed services / serverless / containers, with relatively few long-lived Linux servers.",
          ],
        }}
        pickBlackglass={{
          heading: "Add (or pick) Blackglass when",
          bullets: [
            "You operate long-lived Linux servers (bare metal, VMs, edge boxes) where in-server config drift is your real risk.",
            "You need deterministic, per-line drift evidence — not anomaly scores — to satisfy auditors or change-control reviewers.",
            "You want SOC-2 / CIS / SOX evidence packs you can hand to an external auditor without further interpretation.",
            "Your team is platform / SRE / IT, not cloud security — and you need calmer alerting that respects approved baselines.",
            "Your fleet includes air-gapped or self-hosted environments Wiz can't reach.",
            "Your budget for in-server visibility is $59 – $2,500 per month, not enterprise CNAPP pricing.",
          ],
        }}
        lastReviewed="May 2026"
        sources={[
          { label: "Wiz product overview", href: "https://www.wiz.io/product" },
          { label: "Wiz CNAPP architecture", href: "https://www.wiz.io/solutions/cnapp" },
          { label: "Blackglass product page", href: "https://blackglasssec.com/product" },
        ]}
      />
    </>
  );
}
