import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { VsLayout } from "@/components/marketing/VsLayout";

const PATH = "/vs/qualys";
const TITLE = "Blackglass vs Qualys: VMDR & PC vs Linux baseline drift";
const DESCRIPTION =
  "Honest comparison for Linux operators. Qualys Cloud Platform delivers VMDR, Policy Compliance (PC), and asset inventory at scale. Blackglass complements that stack with continuous, approved-baseline drift on the configuration surface Qualys PC templates may not fully encode.";

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
      title: "Blackglass vs Qualys",
      subtitle: "Enterprise VM & compliance vs baseline-first drift",
    }),
  },
};

export default function BlackglassVsQualysPage() {
  return (
    <>
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/vs" },
          { name: "Blackglass vs Qualys", url: PATH },
        ])}
      />
      <VsLayout
        competitorName="Qualys"
        competitorPositioning="Qualys Cloud Platform: VMDR for vulnerability management, Policy Compliance (PC) with out-of-the-box and custom control libraries, asset inventory, and ticketing integrations. Widely deployed in enterprises for scan-based compliance evidence."
        blackglassPositioning="Linux configuration integrity with operator-captured baselines and per-field drift. Optimised for the question 'what changed since we signed off this server?' with exports designed for change-control and IR workflows."
        relationship="Qualys PC checks controls against a policy library. Blackglass records the actual live configuration as your team approved it and diffs forward from that moment. The two overlap on some CIS-style checks but serve different masters: PC answers 'does this pass the template?', Blackglass answers 'is this still the same server we approved last Tuesday?'"
        comparison={[
          {
            capability: "Policy model",
            competitor:
              "Control libraries (DISA, CIS, custom) evaluated per scan — pass/warning/fail against the library version.",
            blackglass:
              "Your captured baseline is the policy. Any deviation is a drift event regardless of whether a third-party template exists.",
          },
          {
            capability: "Granularity",
            competitor:
              "As granular as the control definition and agent collection allow within the Qualys data model.",
            blackglass:
              "Line-level diffs on sshd effective config, sudoers fragments, listeners, persistence, selected file hashes.",
          },
          {
            capability: "Agent / reachability",
            competitor: "Cloud agents or authenticated scanning depending on deployment mode.",
            blackglass:
              "Lightweight push over SSH or systemd timer; works where Qualys agents are not deployed (edge, customer VMs, small clouds).",
          },
          {
            capability: "Primary buyer",
            competitor: "Enterprise security / VM programmes with established Qualys operations.",
            blackglass:
              "Platform engineering, IT, and lean security teams that need defensible drift evidence without a full PC programme.",
          },
        ]}
        pickCompetitor={{
          heading: "Pick Qualys when",
          bullets: [
            "You are standardised on Qualys for enterprise VM, PC, and CMDB enrichment.",
            "You need multi-OS coverage and a mature control library out of the box.",
            "Your compliance programme already maps evidence collection to Qualys scan reports.",
          ],
        }}
        pickBlackglass={{
          heading: "Add (or pick) Blackglass when",
          bullets: [
            "You need IR-grade 'what changed?' baselines that do not depend on library updates from the vendor.",
            "A subset of Linux hosts cannot run the Qualys agent but still need integrity monitoring.",
            "You want a second opinion surface that is cheaper and calmer than expanding PC custom control authoring for every edge case.",
          ],
        }}
        lastReviewed="May 2026"
        sources={[
          { label: "Qualys Cloud Platform", href: "https://www.qualys.com/apps/cloud-platform/" },
          { label: "Blackglass product page", href: "https://blackglasssec.com/product" },
        ]}
        relatedComparisons={[
          { href: "/vs/wiz", label: "Blackglass vs Wiz" },
          { href: "/vs/lacework", label: "Blackglass vs Lacework" },
          { href: "/vs/orca", label: "Blackglass vs Orca Security" },
          { href: "/vs/tenable", label: "Blackglass vs Tenable" },
        ]}
      />
    </>
  );
}
