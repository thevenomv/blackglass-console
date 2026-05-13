import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, canonical, dynamicOgImages } from "@/lib/seo";
import { VsLayout } from "@/components/marketing/VsLayout";

const PATH = "/vs/sentinelone";
const TITLE = "Blackglass vs SentinelOne: when to pick which (and when to use both)";
const DESCRIPTION =
  "Honest comparison of Blackglass and SentinelOne for Linux teams. SentinelOne is a leading AI-powered EDR/XDR for runtime threat detection; Blackglass focuses on baseline-first Linux configuration drift with auditor-grade evidence.";

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
      title: "Blackglass vs SentinelOne",
      subtitle: "Configuration drift evidence vs AI-powered EDR/XDR",
    }),
  },
};

export default function BlackglassVsSentinelOnePage() {
  return (
    <>
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/vs" },
          { name: "Blackglass vs SentinelOne", url: PATH },
        ])}
      />
      <VsLayout
        competitorName="SentinelOne"
        competitorPositioning="AI-powered endpoint detection and response (EDR) and extended detection and response (XDR) platform. Provides real-time behavioural AI to detect, prevent, and respond to threats across endpoints, cloud workloads, identity, and network. Known for autonomous threat containment and storyline attack-graph correlation."
        blackglassPositioning="Server-side configuration integrity for Linux fleets. Captures explicit approved baselines per host, detects every drift event against them (sshd, sudoers, packages, services, hardening), and exports per-line auditor-readable evidence. Not EDR — no runtime process monitoring, no threat intelligence feed."
        relationship="SentinelOne watches what's running: process trees, memory, file execution, network connections, lateral movement. Blackglass watches what's configured: sshd_config, sudoers, installed packages, enabled services, hardening settings — against a baseline your team approved. The two address entirely different questions. A SentinelOne customer adds Blackglass when 'what changed inside the server's configuration' becomes an audit or change-management question, not a threat-hunting question."
        comparison={[
          {
            capability: "Primary detection model",
            competitor:
              "AI-powered behavioural analysis of runtime process activity, file execution, and network events. Storyline engine correlates events into attack graphs. Threat intelligence + automated MITRE ATT&CK tagging.",
            blackglass:
              "Baseline-first static configuration drift. Operator approves a configuration state per host; every change to the in-scope config files and packages is a drift event, regardless of whether it looks 'suspicious'.",
          },
          {
            capability: "What it monitors",
            competitor:
              "Runtime: process creation, file execution, DLL injection, memory anomalies, network connections, script execution. Very deep into what's happening right now.",
            blackglass:
              "Configuration state: sshd_config, PAM, sudoers, /etc/passwd and group, package versions, running services, hardening settings. What the server looks like, not what it's doing.",
          },
          {
            capability: "Compliance evidence",
            competitor:
              "Compliance dashboards covering MITRE ATT&CK, NIST CSF, and cloud-side frameworks. Evidence is alert/event logs — useful for SOC workflows; requires interpretation for configuration compliance.",
            blackglass:
              "Per-host evidence bundles (PDF + JSONL) with baseline snapshot, per-line diffs, severity, and approval timestamps. Designed for auditors asking about sshd and sudoers state, not process logs.",
          },
          {
            capability: "Linux configuration drift",
            competitor:
              "FIM module watches user-defined paths for changes. Does not have an 'approved baseline' concept — it alerts on change events, not deviation from an operator-approved state.",
            blackglass:
              "Core use case. Per-line diffs against approved baselines. Every drift event has severity, category (hardening / package / service / config), and is exportable as auditor evidence.",
          },
          {
            capability: "Deployment model",
            competitor:
              "Agent-based: Singularity agent installed on each endpoint/server. Requires SentinelOne-approved kernel module on Linux. Cloud-managed console.",
            blackglass:
              "Three modes: SSH pull (agentless), push agent (systemd timer/cron), or hybrid. Self-hosted and air-gap friendly via Helm. No kernel module.",
          },
          {
            capability: "Air-gap / offline support",
            competitor:
              "SentinelOne Singularity supports on-prem / private cloud deployments (Singularity Complete + Data Retention). Kernel agent still required; offline threat intelligence updates are limited.",
            blackglass:
              "Full air-gap support: self-hosted Helm chart, no external connectivity required. Baselines and drift stored locally or in your own object storage.",
          },
          {
            capability: "Pricing posture",
            competitor:
              "Enterprise sales motion; per-endpoint licensing typically $6–$12/endpoint/mo for Singularity Core, higher for Complete/Enterprise. No public self-serve tier.",
            blackglass:
              "Public price ladder from $59/mo (Starter, 15 hosts) to $2,500/mo Enterprise anchor. Free Lab tier and 14-day trial without a card.",
          },
        ]}
        pickCompetitor={{
          heading: "Pick SentinelOne when",
          bullets: [
            "Runtime threat detection is your primary concern: malware, ransomware, lateral movement, supply chain attacks hitting process execution.",
            "You need autonomous threat containment — isolate a compromised host without human intervention.",
            "Your security team runs a SOC and needs MITRE ATT&CK-tagged alert streams, threat hunting, and attack-graph correlation.",
            "You're protecting Windows and macOS endpoints as well as Linux servers and want a single EDR agent across all three.",
            "Enterprise-grade threat intelligence integration (IOCs, threat actor TTPs) is a hard requirement.",
          ],
        }}
        pickBlackglass={{
          heading: "Add (or pick) Blackglass when",
          bullets: [
            "Your auditor is asking about configuration state — sshd_config, sudoers, PAM, package versions — not runtime process logs.",
            "You need a formal 'approved baseline' record: who approved it, when, and every deviation since.",
            "SOC 2 / CIS Benchmark / ISO 27001 evidence requires per-line configuration diffs tied to an approval workflow, not EDR alerts.",
            "Your Linux fleet is on bare metal, VMs, or air-gapped environments where kernel-level EDR agents are prohibited or impractical.",
            "You want zero runtime overhead on the server — Blackglass SSH-pull mode requires no installed agent.",
            "Your budget for configuration compliance visibility is $59 – $2,500 per month, not per-seat EDR pricing.",
          ],
        }}
        lastReviewed="May 2026"
        sources={[
          { label: "SentinelOne Singularity platform", href: "https://www.sentinelone.com/platform/" },
          { label: "SentinelOne Linux agent", href: "https://www.sentinelone.com/platform/singularity-cloud-workload-security/" },
          { label: "SentinelOne FIM documentation", href: "https://www.sentinelone.com/resources/file-integrity-monitoring/" },
          { label: "Blackglass product page", href: "https://blackglasssec.com/product" },
        ]}
        relatedComparisons={[
          { href: "/vs/wazuh", label: "Blackglass vs Wazuh" },
          { href: "/vs/tenable", label: "Blackglass vs Tenable" },
          { href: "/vs/qualys", label: "Blackglass vs Qualys" },
          { href: "/vs/wiz", label: "Blackglass vs Wiz" },
        ]}
      />
    </>
  );
}
