import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { VsLayout } from "@/components/marketing/VsLayout";

const PATH = "/vs/tenable";
const TITLE = "Blackglass vs Tenable: vulnerability management vs configuration integrity";
const DESCRIPTION =
  "Honest comparison for Linux teams. Tenable (Nessus, Tenable.io, Tenable.sc) is the category leader for vulnerability scanning and VM workflows. Blackglass answers a different question: what changed in server configuration since you approved it.";

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
      title: "Blackglass vs Tenable",
      subtitle: "VM & CVE scanning vs approved-baseline drift detection",
    }),
  },
};

export default function BlackglassVsTenablePage() {
  return (
    <>
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/vs" },
          { name: "Blackglass vs Tenable", url: PATH },
        ])}
      />
      <VsLayout
        competitorName="Tenable"
        competitorPositioning="Enterprise vulnerability management: Nessus scanners, Tenable.io / Tenable.sc for continuous assessment, patch prioritisation, and compliance reporting (PCI, DISA STIG, CIS). Strong at finding known CVEs, misconfigurations in the scanner's plugin catalogue, and tracking remediation SLAs."
        blackglassPositioning="Approved-baseline configuration integrity for Linux. Captures trusted snapshots, diffs every scan against them for sshd, sudoers, listeners, persistence, packages, and file hashes — with human-readable evidence exports. Not a CVE database replacement."
        relationship="Tenable tells you whether a host is vulnerable or misconfigured according to its plugin library. Blackglass tells you whether the host still matches the configuration your team explicitly approved — including changes no scanner plugin names yet. Most mid-market teams run Nessus or Tenable.io for VM and add Blackglass when auditors ask 'who changed PermitRootLogin between audits?'"
        comparison={[
          {
            capability: "Primary signal",
            competitor:
              "CVEs, plugin-based misconfigurations, and patch levels — scored and trended for remediation workflows.",
            blackglass:
              "Deterministic drift against a baseline you captured: every field-level change with before/after and timestamps.",
          },
          {
            capability: "Linux sshd / sudoers drift",
            competitor:
              "Covered where a Nessus plugin exists for the specific check; gaps when configs are valid-but-unapproved.",
            blackglass:
              "First-class: effective sshd -T output, sudoers and drop-ins, compared line-by-line to baseline.",
          },
          {
            capability: "Deployment",
            competitor: "Network-based scans and/or authenticated scanning agents depending on product line.",
            blackglass:
              "SSH pull, push agent, or hybrid — no inbound listener required on hosts. Air-gap friendly with self-hosted option.",
          },
          {
            capability: "Compliance evidence",
            competitor:
              "Scan reports, dashboards, and ticketing integrations mapped to VM-centric control frameworks.",
            blackglass:
              "Signed PDF + JSON evidence bundles tied to baseline approval and operator actions — aimed at ITGC / change-control reviewers.",
          },
          {
            capability: "Cloud waste / idle resources",
            competitor: "Out of scope for core VM products.",
            blackglass:
              "Optional Charon add-on (read inventory + approved cleanup requests) for DO / AWS / GCP.",
          },
        ]}
        pickCompetitor={{
          heading: "Pick Tenable when",
          bullets: [
            "Your primary KPI is CVE exposure, patch compliance, or DISA / PCI scanning cadence.",
            "You need a mature ticketing and SLA workflow around scanner findings.",
            "You already have Tenable analysts on staff and want one VM platform across OS types.",
          ],
        }}
        pickBlackglass={{
          heading: "Add (or pick) Blackglass when",
          bullets: [
            "Auditors want proof of every configuration change between formal scans, not just point-in-time pass/fail.",
            "You keep losing hours to 'something changed on this box' incidents where vulnerability status stayed green.",
            "You want calmer, baseline-first alerting for platform / SRE teams without turning them into Nessus experts.",
          ],
        }}
        lastReviewed="May 2026"
        sources={[
          { label: "Tenable product overview", href: "https://www.tenable.com/products" },
          { label: "Blackglass product page", href: "https://blackglasssec.com/product" },
        ]}
        relatedComparisons={[
          { href: "/vs/wiz", label: "Blackglass vs Wiz" },
          { href: "/vs/lacework", label: "Blackglass vs Lacework" },
          { href: "/vs/orca", label: "Blackglass vs Orca Security" },
          { href: "/vs/qualys", label: "Blackglass vs Qualys" },
        ]}
      />
    </>
  );
}
