import {
  Callout,
  Divider,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Table,
  Text,
} from "cursor/canvas";

const USER = (
  <Pill tone="warning" active size="sm">
    YOU
  </Pill>
);
const ENG = (
  <Pill tone="info" active size="sm">
    ENG
  </Pill>
);

/**
 * Prioritised queue for the founder / operator — refresh after each
 * planning pass or when a row ships. Historical wave detail stays in
 * next-50-and-review.canvas.tsx; the review packet stays in
 * project-overview.canvas.tsx.
 */
export default function OutstandingActions() {
  return (
    <Stack gap={22}>
      <Stack gap={6}>
        <H1>Outstanding actions</H1>
        <Text tone="secondary" size="small">
          Last pass: 2026-05-12. Items are ordered roughly by leverage
          (trust, revenue, or incident prevention first). Mark rows done
          in this file when you ship them so the canvas stays honest.
        </Text>
      </Stack>

      <Callout tone="warning" title="Secrets hygiene">
        <Text size="small">
          If an API token was ever pasted into chat or a ticket, assume
          compromise: revoke in the vendor console, set a fresh value only
          in GitHub Actions secrets or Doppler, never in git.
        </Text>
      </Callout>

      <H2>Immediate (this week)</H2>
      <Table
        headers={["#", "Item", "Owner", "Done when"]}
        columnAlign={["right", "left", "center", "left"]}
        rows={[
          [
            "1",
            "Verify sending domain for product mail: complete DNS at Resend for blackglasssec.com so EMAIL_FROM can use noreply@ (trial lifecycle + in-app mail stop failing).",
            USER,
            "Resend dashboard shows domain verified; a real trial mail arrives outside Resend test-inbox limits.",
          ],
          [
            "2",
            "Rotate any live API keys that appeared in chat (Resend, DigitalOcean, etc.) and update GitHub / Doppler only.",
            USER,
            "Old keys revoked; apps still green.",
          ],
          [
            "3",
            "DigitalOcean: rotate DO_API_TOKEN used during the 2026-05-07 showcase recovery if that token was exposed; redeploy web.",
            USER,
            "New token in DO + GitHub secrets; no droplet regressions.",
          ],
          [
            "4",
            "Deploy sandbox-worker (or equivalent) with REDIS_QUEUE_URL so showcase drift seeding progresses past seedPhase=0.",
            USER,
            "Showcase tenant reaches seeded drift; /api/health/showcase returns 200 in steady state.",
          ],
          [
            "5",
            "Merge remaining local repo work (SECURITY.md, ROADMAP, docker-compose, examples, terraform, issue templates, CONTRIBUTING) if you still want it on main — currently some files were only partially pushed in earlier passes.",
            ENG,
            "git status clean; main contains the bundle you expect.",
          ],
        ]}
      />

      <Divider />

      <H2>GTM (unblocks revenue signal)</H2>
      <Table
        headers={["#", "Item", "Owner", "Done when"]}
        columnAlign={["right", "left", "center", "left"]}
        rows={[
          [
            "6",
            "Paste Apollo sequences from docs/sales/apollo-cold-email-sequences.md; connect warmed mailboxes; start a small enrolled cohort.",
            USER,
            "First sequence live with reply tracking; one weekly review of bounces and replies.",
          ],
          [
            "7",
            "After first paying customer: add logo or 'in pilot with N teams' line to /pricing (Section 0 P6 / trust gap).",
            USER,
            "Pricing page shows at least one externally verifiable proof point.",
          ],
        ]}
      />

      <Divider />

      <H2>Product / engineering (scheduled but not fire-and-forget)</H2>
      <Table
        headers={["#", "Item", "Owner", "Done when"]}
        columnAlign={["right", "left", "center", "left"]}
        rows={[
          [
            "8",
            "Per-tenant scan-cost telemetry (Section 0 issues table P9) — Postgres counter from scan-worker for unit-economics visibility.",
            ENG,
            "Metric visible per tenant in console or export; documented in operator runbook.",
          ],
          [
            "9",
            "Comparison landing pages beyond existing /vs/* (e.g. /compare/wazuh) per Section 0 P5.",
            ENG,
            "At least one new URL indexed; internal link from /tools or product nav.",
          ],
          [
            "10",
            "Charon wedge: one linked account free (read-only) per Section 0 P4 — needs product decision + plan gating check.",
            ENG,
            "Shipped behind flag or plan field; marketing copy matches behaviour.",
          ],
          [
            "11",
            "Business tier differentiation (exec summary, SOC2 evidence bundle positioning) per Section 0 P8.",
            USER,
            "Pricing copy + one concrete deliverable in product or services appendix.",
          ],
          [
            "12",
            "Production smoke: manually hit /status from public internet and confirm footer link matches reality (Section 0 P7 partial).",
            USER,
            "Screenshot or uptime probe shows expected body; incident runbook updated if gaps.",
          ],
        ]}
      />

      <Divider />

      <H2>Deferred until a business trigger (do not start early)</H2>
      <Table
        headers={["#", "Item", "Owner", "Trigger (from project overview Section 12)"]}
        columnAlign={["right", "left", "center", "left"]}
        rows={[
          ["13", "SOC 2 Type II audit engagement", USER, "Enterprise prospect blocks procurement without attestation, or questionnaire time exceeds engineering time on a second deal."],
          ["14", "Public status page vendor", USER, "Three paying customers or first incident where absence drove >30 min support load."],
          ["15", "Formal bug bounty program", USER, "First external unsolicited report, or customer asks for coordinated disclosure URL."],
          ["16", "Cross-region Postgres replica", USER, "Contracted RPO/RTO single region cannot meet, or data residency jurisdiction requires it."],
          ["17", "Customer-managed KMS for evidence bundles (wave 2 P2 #35)", USER, "Named customer picks cloud KMS and funds integration."],
          ["18", "Slack OAuth one-click (replaces webhook paste) — wave 2 P1a #12", USER, "Slack app registered; client id, secret, redirect URLs approved."],
        ]}
      />

      <Divider />

      <Row gap={8} align="center" wrap>
        <Pill tone="neutral" size="sm">
          Queue v2026-05-12
        </Pill>
        <Text size="small" tone="tertiary">
          Deep engineering backlog narrative: next-50-and-review.canvas.tsx.
          Reviewer packet: project-overview.canvas.tsx.
        </Text>
      </Row>
    </Stack>
  );
}
