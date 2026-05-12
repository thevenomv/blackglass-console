import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

const SHIPPED = (
  <Pill tone="success" active size="sm">
    SHIPPED
  </Pill>
);

/** Review packet v2.5 — v2.4 plus ops self-check, public artifacts, Apollo playbook pointer, outstanding-actions canvas (2026-05-12). */
export default function ProjectOverview() {
  return (
    <Stack gap={22}>
      {/* ========== COVER ========== */}
      <Stack gap={10}>
        <Stack gap={6}>
          <Text tone="secondary" size="small">
            Version 2.5 · 2026-05-12 · Living artifact — refresh after major
            features, new stores, or security-relevant Charon changes. v2.4 tightens
            reviewer ergonomics: explicit staleness rule on cover, §0 execution
            pointers + next review window, softer ARR comparables wording, marketing
            row defers SEO detail to <Code>seo-follow-up.canvas.tsx</Code>, scope
            callout for staging <Code>noindex</Code> + production canonical from{" "}
            <Code>NEXT_PUBLIC_APP_URL</Code>, RLS contributor norms +{" "}
            <Code>withTenantRls</Code> default, Charon plan-default + scan-job delete
            grep note, stronger migration / queue invariants, CI blocking vs
            non-blocking, org table + support trigger, persona recipe outcomes, and
            /tools gating bullet. v2.3 shipped marketing shell alignment (
            <Code>max-w-7xl</Code>), <Code>seo-follow-up.canvas.tsx</Code>,{" "}
            <Code>cf:public-seo-check</Code> / <Code>cf:audit-edge</Code> (token in
            env only). Earlier: v2.2 §13a + Charon guarantees + §12; v2.1 §0
            strategic refresh. v2.5 adds: root <Code>SECURITY.md</Code> and{" "}
            <Code>ROADMAP.md</Code>; <Code>docker-compose.dev.yml</Code> +{" "}
            <Code>docs/local-dev-docker.md</Code>; <Code>examples/api/</Code> curl/Node
            samples; optional <Code>terraform/digitalocean</Code> starter; GitHub issue
            templates; <Code>docs/sales/apollo-cold-email-sequences.md</Code> for Apollo
            paste-in; CI <Code>ops:selfcheck</Code> + weekly{" "}
            <Code>ops-weekly-selfcheck.yml</Code> (workflow-to-script parity + Resend
            domain table); <Code>uptime.yml</Code> dispatch fix; and{" "}
            <strong>outstanding-actions.canvas.tsx</strong> for the live founder/operator
            queue (kept separate so this packet stays navigable).
          </Text>
          <Text size="small" tone="secondary">
            <strong>Staleness:</strong> if this document date is more than six months
            old or published pricing has changed since the date above, request the
            latest packet from your Blackglass contact instead of relying on this
            copy.
          </Text>
          <H1>BLACKGLASS</H1>
          <Text weight="semibold">
            Multi-tenant fleet integrity for Linux — baselines, drift, evidence —
            plus optional cloud waste hygiene (Charon) behind the same trust model.
          </Text>
        </Stack>

        <H3>Why this packet exists</H3>
        <Stack gap={4}>
          <Text size="small" tone="secondary">
            Give <strong>security</strong> reviewers concrete implementation hooks
            for RLS, queues, Charon approvals, and outbound signing.
          </Text>
          <Text size="small" tone="secondary">
            Give <strong>engineering</strong> a short path to verify guarantees
            end-to-end (tenant context, janitor job flow, webhook edges).
          </Text>
          <Text size="small" tone="secondary">
            Give <strong>procurement / execs</strong> one artifact to anchor vendor
            questions — paired with linked docs, not a substitute for contracts.
          </Text>
          <Text size="small" tone="secondary">
            Give <strong>founders / advisors</strong> a quick read on whether
            pricing and commercial state still match the build — start at §0.
          </Text>
        </Stack>

        <H3>Canonical companion docs</H3>
        <Table
          headers={["Path", "Purpose"]}
          columnAlign={["left", "left"]}
          rows={[
            ["docs/security-compliance.md", "Questionnaire-style controls (incl. §8a Charon, §8b migrations)."],
            ["docs/architecture-overview.md", "Layer map, invariants, Charon queue notes."],
            ["docs/charon.md", "Janitor trust model, IAM starters, multi-region AWS JSON shape."],
            ["docs/first-baseline-runbook.md", "Pilot success criteria, error codes, remedies."],
            ["docs/vendor-inventory.md", "Sub-processors; Charon vs tenant-cloud APIs."],
            ["docs/compliance/review-cadence.md", "Post-deploy and annual checks."],
            ["README.md (repo root)", "Quick start, full npm script matrix, architecture spine, SEO env (NEXT_PUBLIC_APP_URL, noindex)."],
            ["canvases/seo-follow-up.canvas.tsx", "Operational SEO checklist (Search Console, Rich Results, Cloudflare) — Cursor project canvases folder."],
            ["canvases/outstanding-actions.canvas.tsx", "Prioritised founder/operator queue (Resend, DO, Apollo, SOC2 triggers) — same canvases folder; refresh after each planning pass."],
            ["SECURITY.md (repo root)", "Vulnerability reporting policy for reviewers and GitHub private advisories."],
            ["ROADMAP.md (repo root)", "Buyer-safe public roadmap summary (internal detail stays in docs/saas-customer-roadmap.md)."],
            ["docs/local-dev-docker.md", "Disposable Postgres + Redis via docker-compose.dev.yml for laptop onboarding."],
            ["docs/sales/apollo-cold-email-sequences.md", "Internal Apollo cold-email sequences; send via connected mailboxes, not product Resend."],
          ]}
        />

        <H3>Persona routing</H3>
        <Table
          headers={["Persona", "Read fully", "Skim", "Optional"]}
          columnAlign={["left", "left", "left", "left"]}
          rows={[
            [
              "Exec / procurement",
              "§1–2, §4, §6, §12–13",
              "§3, §11",
              "§7–10, §13",
            ],
            [
              "Security reviewer",
              "§2–3, §5–8, §10–11, §13",
              "§1, §6, §9",
              "§4, §12",
            ],
            [
              "Engineer onboarding",
              "§1, §5–10, §13",
              "§2–4, §6, §11",
              "§12",
            ],
            [
              "Growth / SEO",
              "§1 (Marketing web), seo-follow-up canvas, §11 (cf:* scripts)",
              "§0, §4",
              "§2–3, §6–10",
            ],
          ]}
        />

        <H3>Macro map (four themes)</H3>
        <Table
          headers={["Theme", "Sections"]}
          columnAlign={["left", "left"]}
          rows={[
            ["Product surfaces and behaviour", "§1, §6, §9"],
            ["Trust, auth, controls", "§2, §3, §10"],
            ["Runtime architecture and change", "§5, §7, §8, §11"],
            ["Governance and strategy", "§4, §12, §13"],
          ]}
        />

        <Callout tone="warning" title="Scope and limitations of this packet">
          <Stack gap={4}>
            <Text size="small">
              Describes implementation at the stated date —{" "}
              <strong>not</strong> a SOC 2 / ISO certificate and{" "}
              <strong>not</strong> an extension of contractual uptime or security
              commitments.
            </Text>
            <Text size="small">
              <strong>Order of precedence:</strong> if there is any conflict
              between this packet and any signed agreement (MSA, DPA, order
              form, security addendum), the signed agreement prevails.
            </Text>
            <Text size="small">
              Charon destructive actions are plan-gated, approval-gated, and
              customer-IAM-scoped; read-only posture is always available. This
              packet describes how those gates are wired today; it does not
              create any guarantee about future default settings, which are
              governed by product configuration and the agreements above.
            </Text>
            <Text size="small">
              <strong>SEO / indexing:</strong> staging and preview hosts must stay{" "}
              <Code>noindex</Code>; production canonical URLs and sitemap bases come
              from <Code>NEXT_PUBLIC_APP_URL</Code> (see <Code>README.md</Code>).
            </Text>
          </Stack>
        </Callout>
      </Stack>

      <Divider />

      {/* ========== STRATEGIC REFRESH (2026-05-10) ========== */}
      <Stack gap={12}>
        <Row gap={8} align="center" wrap>
          <H2>
            §0. Strategic refresh — 2026-05-10{" "}
            <Text as="span" tone="tertiary" size="small">
              <strong>
                (optional, internal — external security reviewers can skip this
                section; it is not part of the core controls packet.)
              </strong>
            </Text>
          </H2>
          <Pill tone="info" size="sm">
            [STRATEGY]
          </Pill>
        </Row>
        <Callout tone="neutral" title="About this section (read first)">
          <Stack gap={4}>
            <Text size="small">
              This section is a <strong>point-in-time assessment</strong> of
              pricing and commercial state. It is intentionally more opinionated
              than the rest of the packet and may age faster.
            </Text>
            <Text size="small">
              <strong>Standard structure</strong> (kept stable across refreshes
              so the same reader can do a quick diff next time): verdict
              (pricing + mileage) → what's working → issues table (P-numbered)
              → build-depth-vs-commercial-proof snapshot → ordered actions
              table.
            </Text>
            <Text size="small">
              <strong>Review cadence:</strong> refresh every 3–6 months OR
              after any of: a published pricing change, the addition of a new
              tier, the first paying enterprise customer, or a meaningful shift
              in funnel data. Older than 6 months without refresh = treat as
              stale.
            </Text>
          </Stack>
        </Callout>
        <Text size="small" tone="secondary">
          Two questions on the table: <strong>is the published pricing still on
          point?</strong> <strong>Does the project have commercial mileage?</strong>
          {" "}Short answers in the verdict; concrete moves in the recommendations
          table at the end of this section.
        </Text>

        <Callout tone="info" title="Execution status (2026-05-10)">
          <Stack gap={4}>
            <Text size="small">
              <strong>Next review window:</strong> 2026-08 (or sooner if pricing
              or funnel data shifts materially).
            </Text>
            <Text size="small">
              <strong>Pricing-touching calibration shipped (2026-05-10):</strong>{" "}
              P1 chosen branch (buff Starter + keep Lab wedge), P2 (Team tier), P4
              (Lab Charon wedge in marketing), Enterprise anchor raised to $2,500/mo,
              Remediator included quota raised 100 → 250. Logo / testimonial work (
              issues-table P6) remains gated on first paying customer. Scan-cost
              telemetry (issues-table P9) still open.
            </Text>
            <Text size="small">
              <strong>Where to verify in repo:</strong>{" "}
              <Text as="span" weight="semibold">CHANGELOG.md</Text> → &ldquo;Pricing
              (2026-05-10 calibration)&rdquo;; companion{" "}
              <Text as="span" weight="semibold">canvases/blackglass-pricing.canvas.tsx</Text>{" "}
              (Cursor project canvases folder).
            </Text>
            <Text size="small">
              <strong>P1 chosen direction:</strong> buff Starter (raise price
              and inclusions), keep Lab as the funnel wedge unchanged.
              <em> Alternative not taken:</em> trim Lab to 3 hosts + weekly
              scans + no read-only API. Doing both was rejected as too
              aggressive — it would weaken the free wedge and raise the paid
              entry price simultaneously, killing the Plausible funnel signal
              we just wired up. Decision is held pending ~4 weeks of funnel
              data; revisit in the next §0 refresh.{" "}
              <strong>Decision (hold):</strong> keep Lab as the wedge; re-evaluate
              in the next strategic refresh once Plausible funnel data exists.
            </Text>
            <Text size="small">
              <strong>Items still open:</strong> P3 (customer logos — gated on
              first paying customer), P5 (deeper comparison pages — e.g.{" "}
              <Code>/compare/*</Code> beyond existing <Code>/vs/*</Code>), P8
              (Business differentiation, scoping needed), P9 (scan-cost telemetry).{" "}
              <strong>P7 partial (2026-05-11):</strong> public footer links to{" "}
              <Code>/status</Code> (&ldquo;All systems operational&rdquo;); still
              manually verify production behaviour.
            </Text>
          </Stack>
        </Callout>

        <Callout tone="neutral" title="Shipping follow-up (2026-05-11)">
          <Stack gap={4}>
            <Text size="small">
              <strong>Growth / web:</strong> Marketing grid width aligned; footer
              rebalanced (six-column Resources span on large screens); legal links in
              a dedicated row. SEO execution list + edge sanity live in{" "}
              <Code>seo-follow-up.canvas.tsx</Code>; automation in{" "}
              <Code>scripts/cf-public-seo-check.mjs</Code> and{" "}
              <Code>scripts/cloudflare-edge-audit.mjs</Code> (see §11). Production
              deploy tracks <Code>main</Code> on GitHub.
            </Text>
            <Text size="small">
              <strong>Branding:</strong> Image wordmark in nav/footer was tried and
              removed from <Code>main</Code>; keep text chrome until a proper SVG
              lockup exists.
            </Text>
          </Stack>
        </Callout>

        <Callout tone="info" title="Ops automation and mail health (2026-05-12)">
          <Stack gap={4}>
            <Text size="small">
              <strong>CI:</strong> every PR runs <Code>node scripts/ops-automation-selfcheck.mjs</Code>{" "}
              after lint so a missing <Code>scripts/*.mjs</Code> file cannot merge behind a
              workflow reference.
            </Text>
            <Text size="small">
              <strong>Weekly:</strong> <Code>.github/workflows/ops-weekly-selfcheck.yml</Code>{" "}
              (Mondays 07:15 UTC + manual dispatch) re-runs the same parity check and appends
              a Resend domain verification table when <Code>RESEND_API_KEY</Code> is configured
              in repository secrets.
            </Text>
            <Text size="small">
              <strong>Schedules already live:</strong> maintenance (trial lifecycle mail,
              Sunday prunes, billing reconcile when secrets set), uptime <Code>/api/health</Code>{" "}
              every 15 minutes, staging smoke — all require correct GitHub secrets; see{" "}
              <Code>README.md</Code> Operators section.
            </Text>
            <Text size="small">
              <strong>Still manual:</strong> verify <Code>blackglasssec.com</Code> in Resend for
              production <Code>EMAIL_FROM</Code>; rotate any API token ever pasted into chat;
              paste Apollo sequences from <Code>docs/sales/apollo-cold-email-sequences.md</Code>.
              The consolidated checklist lives in <strong>outstanding-actions.canvas.tsx</strong>.
            </Text>
          </Stack>
        </Callout>

        <Callout tone="success" title="Verdict">
          <Stack gap={6}>
            <Text size="small">
              <strong>Pricing — structurally sound, two flaws to fix.</strong>{" "}
              The six-tier ladder, free Lab, gap-filling Scale, published Enterprise
              anchor, and add-on shape are all the right moves. Two pricing flaws
              should be fixed before more spend on top-of-funnel: the Lab→Starter
              value step is too small (no upgrade urgency), and the Starter→Growth
              jump is a 5× cliff with no intermediate landing pad for SMB buyers.
            </Text>
            <Text size="small">
              <strong>Mileage — yes, the build is well past "demo".</strong>{" "}
              Multi-tenant Postgres + RLS, Clerk Enterprise SSO/SCIM, live Stripe
              with daily reconciliation, 11 SIEM/ticketing webhook formats, append-only
              audit, air-gapped mode, Helm self-host, Charon, and the Remediator
              HITL sidecar are all shipped. The remaining gap is commercial proof,
              not engineering: no public customer logos yet and an unvalidated
              funnel are the main things separating this from the kind of build
              depth companies like Tailscale and Vanta had by the time they
              reached meaningful ARR.
            </Text>
          </Stack>
        </Callout>

        <H3>Pricing — what's working (don't touch)</H3>
        <Table
          headers={["Element", "Why it works"]}
          columnAlign={["left", "left"]}
          rows={[
            ["6-tier ladder with Scale at $349 / 200 hosts", "Closes the famous 100→300 host cliff that historically forces churn or renegotiation."],
            ["Lab free forever (5 hosts)", "Neutralises the 'but Wazuh is free' objection without giving away the SaaS feature set."],
            ["Read-only viewers unlimited on every tier", "SOC, audit, and exec viewers don't consume seats — kills a friction point in committee buys."],
            ["Per-host overage cheapens up the ladder ($4 → $1)", "Correctly aligned: bigger fleets carry the variable revenue."],
            ["Per-seat overage gets pricier up the ladder ($20 → $35)", "Correctly aligned: operator seats are the revenue lever, not viewers."],
            ["Enterprise anchor 'From $2,500/mo' (raised 2026-05-10)", "Funds named-CSM / SLA posture; still lets procurement pre-qualify before sales."],
            ["Trial → read-only on expiry, 60-day grace", "Humane churn flow; preserves the option to come back without the dirty-data risk of full deletion."],
            ["Annual = 10× monthly (~17 % off)", "Industry standard; matches buyer expectations without theatrical discount inflation."],
            ["Two add-ons (Remediator $99, Charon $49)", "Clean expansion-revenue lines that aren't gated by host count — they capture intensity, not size."],
          ]}
          striped
        />

        <H3>Pricing — what needs attention</H3>
        <Table
          headers={["#", "Issue", "Severity", "Recommended move"]}
          columnAlign={["right", "left", "center", "left"]}
          rows={[
            [
              "P1",
              "Lab→Starter step is too small. Lab gives 5 hosts + daily scans + drift detection + read-only API; Starter at $39 only adds 5 hosts, 1 seat, 4×/day scans. No real urgency to upgrade.",
              <Pill key="sev1" tone="warning" active size="sm">High</Pill>,
              "Trim Lab (3 hosts, weekly scans, no read-only API) OR raise Starter inclusions and price (≈ $59 / 15 hosts).",
            ],
            [
              "P2",
              "Starter→Growth is a 5× pricing cliff ($39 → $199) with no landing pad for SMB buyers in the 15–50 host band.",
              <Pill key="sev2" tone="warning" active size="sm">High</Pill>,
              "Insert a 'Team' tier at $89/mo for 25 hosts, 3 seats, hourly scans, basic webhooks. Captures the band that's currently bouncing.",
            ],
            [
              "P3",
              "Scale→Business value gap is slim. +$150/mo over Scale buys +100 hosts, 2× scan frequency, immutable audit, and Remediator-included (worth $99). Net new value over Scale + add-on is ≈ $50.",
              <Pill key="sev3" tone="info" active size="sm">Medium</Pill>,
              "Differentiate Business harder — bundle SOC 2 evidence pipeline, monthly executive summary, or quarterly review. Otherwise customers will sit on Scale + Remediator add-on indefinitely.",
            ],
            [
              "P4",
              "Charon is feature-priced, not value-priced. The /tools estimator already surfaces multi-thousand-$/mo waste; customers acting on findings get 10–100× ROI; we capture 1–5%.",
              <Pill key="sev4" tone="info" active size="sm">Medium</Pill>,
              "Make 1 linked account free (wedge from /tools estimator into the real Charon dashboard), then $99/mo OR 1 % of identified monthly waste — whichever higher. Deletion safety: free 1-account usage stays read-only findings; live cleanup continues to require a paid plan entitlement and human approval (charonLiveCleanupEnabled = false on Lab).",
            ],
            [
              "P5",
              "Remediator included quota was tight at 100 actions/mo (metered overage felt expensive vs engineer time).",
              <Pill key="sev5" tone="success" active size="sm">Shipped</Pill>,
              "Included quota raised to 250/mo (2026-05-10). Revisit overage price only if support shows sticker shock after a quarter of data.",
            ],
            [
              "P6",
              "Pricing page has zero customer logos, zero pilot count, no testimonials. Single biggest trust gap on the public surface.",
              <Pill key="sev6" tone="warning" active size="sm">High (trust)</Pill>,
              "Even 'currently in pilot with N teams' beats blank. Add 1–3 logos as soon as a paying customer signs.",
            ],
            [
              "P7",
              "No public competitive-comparison page. Buyers compare to Wazuh / Datadog / Vanta anyway — we just don't capture the search intent.",
              <Pill key="sev7" tone="info" active size="sm">Medium</Pill>,
              "Add /compare/wazuh, /compare/datadog, /compare/vanta. ~1 day each, fits the existing /tools layout.",
            ],
            [
              "P8",
              "Enterprise floor at $1,500/mo can't fund what 'named CSM and SLA' actually means in practice (one named contact, monthly call, defined business-hours response targets, quarterly business review). At $1,500/mo first three Enterprise sales will lose money on CSM time alone.",
              <Pill key="sev8" tone="info" active size="sm">Medium</Pill>,
              "Either raise floor to $2,500/mo OR keep $1,500 as the entry but move named-CSM and SLA into a conditional add-on triggered above ~$4k MRR. (Resolved 2026-05-10 by raising the floor.)",
            ],
            [
              "P9",
              "No usage-based component for scan compute. Hourly-scan customers on Growth pay $199 for ~72k SSH+drift compute jobs/mo. Margins fine today; risks at fleet scale with chatty customers.",
              <Pill key="sev9" tone="neutral" active size="sm">Low (future)</Pill>,
              "Wire per-tenant scan-cost telemetry (1–2 days) so the question can be answered with data when it matters, not after a surprise bill.",
            ],
          ]}
          striped
        />

        <H3>Mileage — read the build</H3>
        <Grid columns={2} gap={12}>
          <Card>
            <CardHeader>Positive signals</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small">
                  <strong>Build depth:</strong> multi-tenant Postgres + RLS,
                  Clerk Enterprise (SSO / SCIM / MFA), BullMQ across three worker
                  processes, Stripe live with daily reconciliation, 11 outbound
                  webhook destination formats, append-only audit with verifiable
                  digest, pluggable secrets / KMS, partitioned drift, air-gapped
                  mode, Helm self-host, Remediator sidecar, Sentry + OTLP,
                  hash-tracked migrations.
                </Text>
                <Text size="small">
                  <strong>Three differentiated wedges:</strong> Linux drift
                  (vs Wazuh: managed, no self-ops), Charon cloud waste (no peer
                  in this combination), Remediator HITL AI (most "AI ops" peers
                  ship ungated production write).
                </Text>
                <Text size="small">
                  <strong>End-to-end paid funnel works:</strong> signup → trial →
                  Stripe → webhook → plan-store → feature gates → Stripe webhook
                  reconcile. Not a wireframe — actual Stripe live mode.
                </Text>
                <Text size="small">
                  <strong>Real enterprise plumbing:</strong> 11 SIEM / ticketing
                  destinations, immutable audit option, GDPR retention docs,
                  ICO-registered, Clerk Enterprise SCIM ready.
                </Text>
                <Text size="small">
                  <strong>/tools surface live</strong> with Plausible analytics —
                  measurable top-of-funnel from this week, three pre-signup
                  utilities (cloud-waste estimator, drift-risk score, inventory
                  diff) all pointing at /demo and /pricing.
                </Text>
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>Concerning signals</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small">
                  <strong>No public customer logos or counts yet</strong> on
                  /pricing or anywhere public. Single biggest trust gap. (Pilot
                  conversations exist; this is about what's externally visible.)
                </Text>
                <Text size="small">
                  <strong>Funnel unvalidated.</strong> Plausible was wired this
                  week — no conversion data yet, so every pricing recommendation
                  in the table above is structural, not data-driven.
                </Text>
                <Text size="small">
                  <strong>Founder bandwidth.</strong> Sales-led Enterprise tier
                  promises CSM and SLA that one human can't sustain past a
                  handful of accounts; the raised $2,500/mo floor helps, but
                  watch CSM load as the first Enterprise deals close.
                </Text>
                <Text size="small">
                  <strong>Operational maturity vs build investment ratio.</strong>{" "}
                  Recovery UX took multiple loops to ship; status page is
                  referenced but not yet verified live. Build depth is ahead of
                  polish on the customer-facing edges; that's visible to buyers
                  but fixable.
                </Text>
                <Text size="small">
                  <strong>No "land" wedge in the paid funnel.</strong> Lab is
                  too generous OR Starter is too thin — depending which way you
                  look at it. Today the upgrade isn't urgent enough to convert.
                </Text>
              </Stack>
            </CardBody>
          </Card>
        </Grid>

        <H3>
          Build depth in context{" "}
          <Text as="span" tone="tertiary" size="small">
            (Contextual snapshot — illustrative, not a valuation claim)
          </Text>
        </H3>
        <Grid columns={3} gap={16}>
          <Stat
            value="—"
            label="Qualitative precedent only: Tailscale / Vanta–class build depth at meaningful ARR (no ARR figures — avoids misread)"
            tone="info"
          />
          <Stat value="0" label="Public customer logos today" tone="danger" />
          <Stat value="0" label="Conversion data points (Plausible just wired)" tone="warning" />
        </Grid>
        <Text size="small" tone="tertiary">
          Comparable depth, not comparable revenue — yet. The build is in front
          of the commercial proof, which is the right way round (the opposite
          would be unfixable). This table is here to keep founder expectations
          grounded; it should not be used as an external projection or
          valuation tool.
        </Text>

        <H3>Recommended next moves (ordered)</H3>
        <Table
          headers={["#", "Move", "Effort", "Band", "Priority"]}
          columnAlign={["right", "left", "left", "center", "center"]}
          rows={[
            ["1", "Insert 'Team' tier at $89/mo (25 hosts, 3 seats, hourly scans). Closes the Starter→Growth cliff.", "1 day", "Eng", <Pill key="p1" tone="success" active size="sm">Shipped</Pill>],
            ["2", "Trim Lab to 3 hosts + weekly scans, OR raise Starter to $59 / 15 hosts. Pick one — both create upgrade urgency.", "Half day", "F+E", <Pill key="p2" tone="success" active size="sm">Shipped</Pill>],
            ["3", "Add at least 1 customer logo / 'in pilot with N teams' line to /pricing. Trigger: first paying customer.", "2 hours", "F", <Pill key="p3" tone="warning" active size="sm">P0 (after 1st sale)</Pill>],
            ["4", "Make Charon free for 1 linked account. Wedge from /tools estimator into the real Charon dashboard.", "1 day", "Eng", <Pill key="p4" tone="info" active size="sm">P1</Pill>],
            ["5", "Add /compare/wazuh, /compare/datadog, /compare/vanta — capture comparison search intent buyers run anyway.", "2–3 days", "F+D", <Pill key="p5" tone="info" active size="sm">P1</Pill>],
            ["6", "Raise Enterprise floor to $2,500/mo OR move named CSM + SLA to a separate add-on.", "Copy only", "F", <Pill key="p6" tone="success" active size="sm">Shipped</Pill>],
            ["7", "Verify /status works and link it from the footer. Ops maturity signal for buyers.", "1 hour", "F+E", <Pill key="p7" tone="info" active size="sm">P1</Pill>],
            ["8", "Differentiate Business harder (SOC 2 evidence pipeline, monthly exec summary). Today it's squeezed by Scale + Remediator add-on.", "1 day copy + scoping", "F+E", <Pill key="p8" tone="neutral" active size="sm">P2</Pill>],
            ["9", "Raise Remediator included quota to 250–500/mo OR drop overage to $0.05/action.", "30 min", "Eng", <Pill key="p9" tone="success" active size="sm">Shipped (250)</Pill>],
            ["10", "Wire per-tenant scan-cost telemetry (Postgres counter incremented in scan-worker). Future-proof unit economics before a chatty customer arrives.", "1–2 days", "Eng", <Pill key="p10" tone="neutral" active size="sm">P3</Pill>],
          ]}
          striped
        />
        <Text size="small" tone="tertiary">
          <strong>Band key:</strong> F = founder time, E = engineering, D = design/content. Use it to sequence when calendar is the constraint.
        </Text>

        <Callout tone="info" title="What I would not recommend changing">
          <Stack gap={4}>
            <Text size="small">
              The <strong>six-tier shape, Lab existence, Scale tier, Enterprise
              anchor, and the two add-ons</strong> are the right structural
              moves — keep them. The recommendations above are calibration, not
              architecture.
            </Text>
            <Text size="small">
              Don't pull the free <strong>/tools</strong> surface back behind
              a signup wall before you have funnel data. The cost of the surface
              is small; the cost of cutting it preemptively is the entire
              top-of-funnel signal.
            </Text>
            <Text size="small">
              Do <strong>not</strong> gate <Code>/tools</Code> behind signup until at
              least several weeks of Plausible data show how people use it; keeping
              it public is cheap and the learning value is high.
            </Text>
          </Stack>
        </Callout>
      </Stack>

      <Divider />

      {/* ========== PRODUCT ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>1. Product surfaces</H2>
          <Pill tone="neutral" size="sm">
            [PRODUCT]
          </Pill>
        </Row>
        <Table
          headers={["Surface", "Purpose (plain)", "Review questions we answer"]}
          columnAlign={["left", "left", "left"]}
          rows={[
            [
              "Linux drift",
              "What changed on which host, versus an agreed baseline.",
              "How is drift stored, muted, and audited? Can operators see before/after?",
            ],
            [
              "Fleet console",
              "Day-to-day operator home: hosts, drift, reports, settings.",
              "Where is RBAC enforced — UI only or every API route?",
            ],
            [
              "SaaS shell",
              "Clerk org → tenant; Stripe; multi-tenant Postgres.",
              "How is tenant mixing prevented at the DB boundary?",
            ],
            [
              "Charon",
              "Idle cloud resources (DO/AWS/GCP) with human-gated deletes.",
              "Can it delete the wrong thing? Who approved? Read-only forever OK? Proof in audit + RLS?",
            ],
            [
              "Remediator",
              "Optional Python sidecar; plans verified in sandbox droplets.",
              "Is production touched without human approval? (No — see remediator safety model.)",
            ],
            [
              "Marketing web",
              "Public acquisition and trust pages (full URL matrix + operator checklist live in seo-follow-up.canvas.tsx and sitemap.ts).",
              "Are sitemap/robots reachable? Staging noindex? Canonical from NEXT_PUBLIC_APP_URL? Quick probe: npm run cf:public-seo-check.",
            ],
          ]}
        />
        <Callout tone="neutral" title="SEO &amp; edge operations">
          <Stack gap={4}>
            <Text size="small">
              In-repo: <Code>src/app/sitemap.ts</Code>, <Code>robots.ts</Code>, per-page
              metadata. <strong>Full operator checklist</strong> (Search Console, Rich
              Results, LinkedIn unfurl, Cloudflare SSL/bot/cache):{" "}
              <Code>seo-follow-up.canvas.tsx</Code>. From repo:{" "}
              <Code>npm run cf:public-seo-check</Code> (no secrets). Read-only
              Cloudflare audit: <Code>CLOUDFLARE_API_TOKEN</Code> only from env →{" "}
              <Code>npm run cf:audit-edge</Code> — never commit tokens; rotate any
              token ever pasted into chat.
            </Text>
            <Text size="small">
              <strong>Indexing rule:</strong> staging stays <Code>noindex</Code>;
              production canonicals derive from <Code>NEXT_PUBLIC_APP_URL</Code>.
            </Text>
          </Stack>
        </Callout>
        <Text tone="tertiary" size="small">
          Demo <Code>/demo</Code> uses fictional data only.
        </Text>
      </Stack>

      <Divider />

      {/* ========== TRUST ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>2. Trust boundaries</H2>
          <Pill tone="neutral" size="sm">
            [TRUST &amp; CONTROLS]
          </Pill>
        </Row>
        <Text size="small" tone="secondary">
          Tenant isolation is enforced in <strong>Postgres via RLS</strong>. The web
          tier sets tenant context per request; workers run jobs that carry an
          explicit tenant id and use the same RLS helpers, or bypass RLS only for
          narrowly defined cross-tenant duties (e.g. Stripe/Clerk webhooks,
          migration tooling). <strong>SSH and Charon credentials</strong> use
          envelope encryption; plaintext exists only transiently for scan work.
        </Text>
        <Text size="small" tone="secondary">
          <Code>withTenantRls</Code> is the default path in <Code>src/db/index.ts</Code>;
          departing from it is rare and should look suspicious in review. New
          contributors must not introduce <Code>withBypassRls</Code> in route handlers
          serving tenant-scoped API without a documented, approved reason (webhooks,
          platform jobs, and the narrow cases listed in the function JSDoc are the
          intended exceptions).
        </Text>
        <Text size="small" tone="tertiary">
          <pre
            style={{
              margin: 0,
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              lineHeight: 1.45,
              whiteSpace: "pre",
            }}
          >
            {`Browser → Next.js (API + UI) → BullMQ → workers
                    ↓
              Postgres (RLS per tenant)
                    ↓
         SSH targets / cloud APIs (customer authorised)`}
          </pre>
        </Text>
        <Table
          headers={["Mechanism", "Pointer"]}
          columnAlign={["left", "left"]}
          rows={[
            ["RLS + withTenantRls", <span key="m1"><Code>src/db/index.ts</Code>, drizzle policies (<Code>drizzle/0016_consolidate_rls_gucs.sql</Code>)</span>],
            ["Bypass RLS", <span key="m2"><Code>withBypassRls</Code> — webhooks, migrations, cross-tenant workers only. <strong>Greppable convention:</strong> every callsite is preceded by a single-line <Code>// RLS-BYPASS: &lt;reason&gt;</Code> comment. Run <Code>rg &quot;RLS-BYPASS:&quot; src</Code> to enumerate every cross-tenant code path; the per-callsite count must equal <Code>rg &quot;withBypassRls\(&quot; src</Code> minus the function definition in <Code>src/db/index.ts</Code> — adding a new <Code>withBypassRls</Code> call without the tag is a review-blocker (see JSDoc on the function itself).</span>],
            ["Secrets envelope", <span key="m3"><Code>src/lib/server/secrets/envelope.ts</Code></span>],
            ["Signed outbound webhooks", <span key="m4"><Code>src/lib/server/outbound-webhook.ts</Code>; Charon uses <Code>dispatchTenantJsonWebhooks</Code></span>],
            ["Airgap", <span key="m5"><Code>BLACKGLASS_AIRGAPPED</Code> — <Code>src/lib/server/airgap.ts</Code></span>],
          ]}
        />
        <Callout tone="info" title="Reviewer recipe — enumerate every RLS bypass in 5 seconds">
          <Stack gap={4}>
            <Text size="small">
              <Code>rg &quot;RLS-BYPASS:&quot; src</Code> returns every cross-tenant call site
              with a one-line reason next to it. Reconcile the line count with{" "}
              <Code>rg &quot;withBypassRls\(&quot; src --type ts</Code> (minus JSDoc lines
              and the illustrative example in <Code>src/db/index.ts</Code>) — run{" "}
              <Code>npm run check:rls-bypass</Code> for the authoritative count; drift vs
              prose in this packet is fine, drift vs CI is not.
            </Text>
            <Text size="small">
              The per-callsite count must equal the tagged count. If it doesn&apos;t,
              a new bypass slipped in untagged — add the comment or use{" "}
              <Code>withTenantRls</Code> instead.
            </Text>
          </Stack>
        </Callout>
      </Stack>

      <Divider />

      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>3. Authentication and authorisation</H2>
          <Pill tone="neutral" size="sm">
            [TRUST &amp; CONTROLS]
          </Pill>
        </Row>
        <Table
          headers={["Topic", "Detail"]}
          columnAlign={["left", "left"]}
          rows={[
            ["Clerk (SaaS)", "Primary: org membership, SSO/SCIM on Enterprise."],
            ["Legacy session", "Self-hosted / dev path when Clerk off — see auth-clerk-legacy-matrix.md."],
            [
              "RBAC + Charon",
              "janitor.read / janitor.manage gate all Charon APIs; destructive work additionally flows through cleanup_request + approval (UI or Slack), not scan alone.",
            ],
            [
              "Org → tenant invariant",
              "A Clerk organisation maps to exactly one saas_tenant; session carries one org context — no cross-tenant role merge in a single session.",
            ],
            ["API keys", "Hashed at rest; scoped — api-key-service.ts"],
          ]}
        />
      </Stack>

      <Divider />

      {/* ========== GOVERNANCE: LEGAL ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>4. Legal routes</H2>
          <Pill tone="neutral" size="sm">
            [GOVERNANCE]
          </Pill>
        </Row>
        <Table
          headers={["Page", "Note"]}
          columnAlign={["left", "left"]}
          rows={[
            ["/terms · /privacy · /dpa", "Charon and cloud credentials described; effective dates — counsel for material changes."],
            ["/subprocessors", "Vendor list for questionnaires."],
          ]}
        />
      </Stack>

      <Divider />

      {/* ========== RUNTIME: ARCH ========== */}
      <Stack gap={12}>
        <Row gap={8} align="center" wrap>
          <H2>5. Runtime architecture</H2>
          <Pill tone="neutral" size="sm">
            [RUNTIME]
          </Pill>
        </Row>
        <Grid columns={3} gap={12}>
          <Card>
            <CardHeader>Web</CardHeader>
            <CardBody>
              <Text size="small" tone="secondary">
                Next.js App Router; APIs under <Code>src/app/api/</Code>.
              </Text>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>Workers</CardHeader>
            <CardBody>
              <Text size="small" tone="secondary">
                scan-worker (SSH); ops-worker (webhooks, exports, maintenance,{" "}
                <strong>janitor</strong>); sandbox-worker (remediator VMs).
              </Text>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>Data plane</CardHeader>
            <CardBody>
              <Text size="small" tone="secondary">
                Postgres, Redis/Valkey, Spaces; Helm for self-host.
              </Text>
            </CardBody>
          </Card>
        </Grid>
      </Stack>

      <Divider />

      {/* ========== PRODUCT: CHARON ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>6. Charon — safety and flow</H2>
          <Pill tone="neutral" size="sm">
            [PRODUCT]
          </Pill>
          {SHIPPED}
        </Row>

        <Callout tone="success" title="Guarantees (Charon, today)">
          <Stack gap={4}>
            <Text size="small">
              <strong>Async execution.</strong> Scan and cleanup work are not
              performed on the HTTP thread; they always pass through the{" "}
              <Code>blackglass-janitor</Code> BullMQ queue handled by
              ops-worker.
            </Text>
            <Text size="small">
              <strong>Approval before destructive work.</strong> Live cleanup
              requires both a <Code>cleanup_request</Code> row{" "}
              <em>and</em> an explicit approval event (console click or
              signature-verified Slack response). The scan job alone never
              deletes.
            </Text>
            <Text size="small">
              <strong>Credentials never leave the trust boundary.</strong> The
              API never returns decrypted cloud credentials; tenant credential
              rows are envelope-encrypted at rest and isolated by RLS.
            </Text>
            <Text size="small">
              <strong>Auditability.</strong> Every privileged Charon action
              (link, scan-policy change, suppression, cleanup-request,
              approval, executor run) writes a row to the append-only audit
              log; optional outbound webhooks are HMAC-SHA256 signed like
              drift events.
            </Text>
            <Text size="small">
              <strong>Plan-gated entitlement.</strong> Live cleanup is a
              per-plan feature flag (<Code>charonLiveCleanupEnabled</Code> in{" "}
              <Code>src/lib/saas/plans.ts</Code>); a tenant on Lab cannot
              approve a destructive action even with operator privileges.
            </Text>
            <Text size="small">
              <strong>Default plan for new tenants</strong> (typically Lab / trial)
              determines whether live cleanup is even reachable — plan gating is not
              only a feature flag, it is the default onboarding posture.
            </Text>
          </Stack>
        </Callout>

        <Callout tone="warning" title="Non-guarantees (read these explicitly)">
          <Stack gap={4}>
            <Text size="small">
              <strong>Cloud-provider idempotency</strong> beyond what the
              upstream APIs provide. We retry with the provider's documented
              idempotency model where one exists; we do not promise
              exactly-once semantics for actions that the provider itself does
              not.
            </Text>
            <Text size="small">
              <strong>Customer IAM scope.</strong> We document recommended
              read-only / minimum-permission scopes in{" "}
              <Code>docs/charon.md</Code> and surface a recommended-policy JSON
              per provider, but customers can grant broader scopes; we cannot
              guarantee a customer's IAM is safely scoped, only enforce what
              the credential allows.
            </Text>
            <Text size="small">
              <strong>Customer-side resource recoverability.</strong> Once a
              cloud provider confirms a delete, recovery is governed by the
              provider's snapshot / soft-delete policy, not by Blackglass.
            </Text>
            <Text size="small">
              <strong>Future default settings.</strong> The gates above
              describe how Charon is wired today; future product configuration
              and signed agreements govern any change to defaults.
            </Text>
          </Stack>
        </Callout>

        <Text size="small" tone="secondary">
          <strong>Default posture:</strong> inventory and findings are useful
          without ever approving a delete. Live cleanup requires plan entitlement{" "}
          <em>and</em> explicit operator approval — scan-only tenants stay
          read-only at the action layer.
        </Text>

        <Table
          headers={["Stage", "What to verify in code"]}
          columnAlign={["left", "left"]}
          rows={[
            ["Link / encrypt", <span key="s1"><Code>src/app/api/v1/janitor/accounts</Code> POST → <Code>encryptKey</Code>; no secret in JSON response</span>],
            ["Scan", <span key="s2"><Code>src/lib/server/services/janitor-scan-job.ts</Code>: policies → suppressions → finalize; snapshot/diff persisted</span>],
            ["Notify", <span key="s3">Optional digest + <Code>charon.scan.completed</Code> via <Code>src/lib/server/outbound-webhook.ts</Code></span>],
            [
              "Delete",
              <span key="s4">
                cleanup → approve → executor (separate job); the scan job is read-only
                by construction (scan job code should contain <strong>no</strong>{" "}
                provider delete calls — reviewers grep to confirm).
              </span>,
            ],
          ]}
        />

        <Callout tone="neutral" title="Optional slice for Janitor-only reviews">
          <Text size="small">
            When someone is evaluating Charon without the full packet, export{" "}
            <strong>§6</strong> plus the Charon rows in <strong>§2–3, §7–8</strong> into
            a short standalone &ldquo;Charon safety model&rdquo; PDF or memo — same
            content, narrower page count.
          </Text>
        </Callout>

        <Text size="small" tone="tertiary">
          HTTP surface (authenticated):{" "}
          <Code>
            /janitor/accounts, /scan, /do/scan, /policies, /findings,
            /findings/suppress, /suppressions, /cleanup-requests, /cleanup,
            /cleanup/approve, /slack
          </Code>{" "}
          — see <Code>openapi/blackglass.yaml</Code>.
        </Text>
        <Text size="small" tone="tertiary">
          Findings list caps <Code>pageSize</Code> at 50 (API route) to bound
          response size.
        </Text>
      </Stack>

      <Divider />

      {/* ========== RUNTIME: MIGRATIONS ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>7. Schema and change management</H2>
          <Pill tone="neutral" size="sm">
            [RUNTIME]
          </Pill>
        </Row>
        <Text size="small" tone="secondary">
          Schema changes ship as <strong>sequential, hash-tracked</strong> Drizzle
          migrations — no ad-hoc DDL in production. RLS policy edits are SQL under
          review like application code. Reviewers should assume every tenant table
          in prod was created or altered through the numbered migration series below.
        </Text>
        <Text size="small" tone="secondary">
          We do <strong>not</strong> permit schema changes outside this migration
          series; changes made by other means (manual DDL, one-off console edits) are
          treated as <strong>incidents</strong> until replayed through a reviewed
          migration and verified.
        </Text>
        <Text size="small" tone="tertiary">
          Runner + governance: scripts/ops/apply-migrations.mjs · docs/security-compliance.md §8b
        </Text>

        <Callout tone="warning" title="Risk spotlight (focus here first)">
          <Stack gap={4}>
            <Text size="small">
              <Code>0012</Code> retention/exports — broader data lifecycle surface.
            </Text>
            <Text size="small">
              <Code>0014</Code> tenant KMS keys — key-handling story.
            </Text>
            <Text size="small">
              <Code>0019+</Code> Charon — linked cloud creds, findings, cleanup queue, suppressions, scan diff.
            </Text>
          </Stack>
        </Callout>

        <Table
          headers={["#", "Migration", "Purpose (short)"]}
          columnAlign={["right", "left", "left"]}
          rows={[
            ["0", "0000_init_saas_schema", "Tenants, memberships, RLS base"],
            ["1", "0001_add_collector_hosts", "Collector hosts"],
            ["2", "0002_add_evidence_bundles", "Evidence pointers"],
            ["3", "0003_drift_events_partition", "Partitioned drift"],
            ["4", "0004_tenant_credentials", "Encrypted creds"],
            ["5", "0005_collector_hosts_credential_id", "Host → credential"],
            ["6", "0006_sandboxes", "Sandbox rows"],
            ["7", "0007_sandbox_firewall_id", "Firewall ref"],
            ["8", "0008_api_keys_policies", "API keys + policies"],
            ["9", "0009_tenant_notifications", "Notification routing"],
            ["10", "0010_remediations", "Remediator rows"],
            ["11", "0011_drift_mutes", "Mutes"],
            ["12", "0012_retention_exports_cis", "Retention, exports, CIS"],
            ["13", "0013_webhook_signing_keys", "Webhook HMAC rotation"],
            ["14", "0014_tenant_kms_keys", "BYOK refs"],
            ["15", "0015_drift_digest_cadence", "Digests"],
            ["16", "0016_consolidate_rls_gucs", "RLS GUC alignment"],
            ["17", "0017_baseline_capture_jobs", "Async baseline jobs"],
            ["18", "0018_host_tombstones", "Tombstones"],
            ["19", "0019_janitor_charon", "Charon core"],
            ["20", "0020_janitor_cleanup_requests", "Cleanup queue"],
            ["21", "0021_janitor_accounts_provider_uq", "Account uniqueness"],
            ["22", "0022_saas_tenants_charon_policies", "Tenant Charon JSON policy"],
            ["23", "0023_janitor_last_scan_status", "Scan status fields"],
            ["24", "0024_janitor_resource_suppressions", "Suppressions"],
            ["25", "0025_janitor_scan_snapshot_diff", "Snapshot + diff JSONB"],
          ]}
        />
      </Stack>

      <Divider />

      {/* ========== RUNTIME: QUEUES ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>8. Queues and limits</H2>
          <Pill tone="neutral" size="sm">
            [RUNTIME]
          </Pill>
        </Row>
        <Callout tone="info" title="Invariants">
          <Stack gap={4}>
            <Text size="small">
              Heavy and destructive work does not belong on the HTTP thread — it
              goes through BullMQ workers.
            </Text>
            <Text size="small">
              Jobs are processed with explicit tenant context; do not mix tenants in
              one job payload.
            </Text>
            <Text size="small">
              New destructive flows <strong>must</strong> be introduced via queues and
              reviewed in <Code>src/lib/server/queue/config.ts</Code>; destructive
              cloud or fleet actions initiated directly from HTTP handlers are not an
              acceptable pattern.
            </Text>
          </Stack>
        </Callout>
        <Table
          headers={["Queue", "Worker", "Retry (summary)"]}
          columnAlign={["left", "left", "left"]}
          rows={[
            ["blackglass-scans", "scan-worker", "3× exp 2s — SSH concurrency also capped by scan-worker RAM heuristic (see architecture-overview)"],
            ["blackglass-janitor", "ops-worker", "3× exp 15s — cloud API bound"],
            ["blackglass-webhooks", "ops-worker", "6× exp 5s — failed set retained (DLQ-style)"],
            ["blackglass-exports", "ops-worker", "3× exp 30s"],
            ["blackglass-maintenance", "ops-worker", "1× — repeatables recover next tick"],
            ["blackglass-sandbox", "sandbox-worker", "Provision/seed/cleanup per config.ts"],
            ["blackglass-reports", "ops-worker", "Report jobs"],
            ["blackglass-evidence", "ops-worker", "Bundle jobs"],
          ]}
        />
        <Text size="small" tone="tertiary">
          Source of truth: src/lib/server/queue/config.ts (
          <Code>QUEUE_NAMES</Code>, <Code>RETRY_POLICIES</Code>,{" "}
          <Code>RETENTION</Code>)
        </Text>
      </Stack>

      <Divider />

      {/* ========== PRODUCT: ONBOARDING ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>9. First baseline / onboarding</H2>
          <Pill tone="neutral" size="sm">
            [PRODUCT]
          </Pill>
        </Row>
        <Callout tone="success" title="Pilot success (typical)">
          <Text size="small">
            First ingest within ~10 minutes of a correct install; baseline pinned
            deliberately after bundle preview; transient errors clear with one retry
            or documented remedy — see docs/first-baseline-runbook.md.
          </Text>
        </Callout>
        <Text size="small" weight="semibold">
          Error taxonomy (sample — full table in runbook)
        </Text>
        <Table
          headers={["Code", "Operator action", "Recoverable?"]}
          columnAlign={["left", "left", "left"]}
          rows={[
            ["host_tombstoned", "Reset and reinstall or wait for TTL", "Yes"],
            ["bundle_truncated", "Fix sudo/timeout on host; re-run agent", "Yes"],
            ["host_quota_exceeded", "Remove host or upgrade plan", "After quota fix"],
            [
              "tenant_key_unavailable",
              "Contact support — may require platform key rotation / manual recovery",
              "No (operator-side)",
            ],
          ]}
        />
      </Stack>

      <Divider />

      {/* ========== TRUST: SECURITY MATRIX SLIM ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>10. Security controls (index)</H2>
          <Pill tone="neutral" size="sm">
            [TRUST &amp; CONTROLS]
          </Pill>
        </Row>
        <Table
          headers={["Control", "Where"]}
          columnAlign={["left", "left"]}
          rows={[
            ["RLS + tenant GUC", <span key="c1"><Code>src/db/index.ts</Code>, drizzle migrations (<Code>0016_consolidate_rls_gucs.sql</Code>)</span>],
            ["Headers / CSP", <span key="c2"><Code>next.config.ts</Code>, <Code>src/lib/server/security-headers.ts</Code></span>],
            ["Webhook HMAC + rotation", <span key="c3">webhook signing keys + <Code>src/lib/server/outbound-webhook.ts</Code></span>],
            ["Stripe / Clerk idempotency", "Webhook claim-before-handle pattern"],
            ["Rate limits", <span key="c5"><Code>src/lib/server/rate-limit.ts</Code></span>],
            ["Charon credential handling", "janitor accounts + envelope encryption (RLS-BYPASS-tagged at the lookup edge — see §2 recipe)"],
          ]}
        />
      </Stack>

      <Divider />

      {/* ========== RUNTIME: CI + FOOTPRINT ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>11. CI, contracts, footprint</H2>
          <Pill tone="neutral" size="sm">
            [RUNTIME]
          </Pill>
        </Row>
        <Table
          headers={["Gate", "Command", "CI role"]}
          columnAlign={["left", "left", "left"]}
          rows={[
            [
              "Stage-0 / quality bundle",
              "npm run verify:stage0 (local) · CI runs lint, check:rls-bypass, typecheck, db:migrate:files, build (+ more — see ci.yml)",
              "Blocking on PR CI — merge should not proceed if this job fails.",
            ],
            [
              "RLS-BYPASS tag parity",
              <span key="rls1">
                <Code>npm run check:rls-bypass</Code> · <Code>scripts/check-rls-bypass-tags.mjs</Code>
              </span>,
              <span key="rls2">
                Blocking on PR CI — every <Code>withBypassRls(</Code> callsite must have a matching{" "}
                <Code>// RLS-BYPASS:</Code> line (see <Code>src/db/index.ts</Code> JSDoc).
              </span>,
            ],
            [
              "OpenAPI parity",
              "npm run check:openapi + npm run openapi:types (+ zod export drift check in CI)",
              "Blocking — treat manual override as exceptional; breaks client contracts.",
            ],
            [
              "Full CI",
              ".github/workflows/ci.yml (unit + e2e + migrations job)",
              "Blocking — default release gate.",
            ],
            [
              "Public SEO probe (no token)",
              "npm run cf:public-seo-check",
              "Non-blocking in default CI today — run locally or wire an optional job until the SEO gate is mature.",
            ],
            [
              "Cloudflare zone read-only audit",
              <span key="cf1">
                <Code>CLOUDFLARE_API_TOKEN</Code> read-only, <strong>env-only</strong> →{" "}
                <Code>npm run cf:audit-edge</Code>
              </span>,
              "Manual / scheduled — token is never committed to the repo; rotate if exposed.",
            ],
          ]}
        />
        <Text size="small" tone="tertiary">
          Highlight: <Code>CLOUDFLARE_API_TOKEN</Code> is read-only, loaded only from
          environment, and must never appear in git history.
        </Text>
        <Callout tone="info" title="Codebase footprint (context, not a scorecard)">
          <Stack gap={6}>
            <Grid columns={3} gap={10}>
              <Stat value="~457" label="TS/TSX under src/" />
              <Stat value="~101" label="API route handlers" />
              <Stat value="26" label="SQL migrations" />
              <Stat value="69" label="Vitest files" />
              <Stat value="9" label="BullMQ queues" />
              <Stat value="3" label="Worker processes" />
            </Grid>
            <Text size="small" tone="secondary">
              Large enough to be a real product; small enough to review in a few
              focused sessions when you follow the persona map above.
            </Text>
          </Stack>
        </Callout>
      </Stack>

      <Divider />

      {/* ========== GOVERNANCE: STRATEGIC ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>12. Organisation decisions (not engineering blockers)</H2>
          <Pill tone="neutral" size="sm">
            [GOVERNANCE]
          </Pill>
        </Row>
        <Text size="small" tone="tertiary">
          Each row is a decision the engineering side has deliberately deferred
          until a business signal makes it economical. The trigger column says
          what that signal is, so neither side waits indefinitely.
        </Text>
        <Table
          headers={["Topic", "Default stance", "Trigger to revisit"]}
          columnAlign={["left", "left", "left"]}
          rows={[
            [
              "SOC 2 Type II",
              "Architecture aligns with common controls; no report until you engage an auditor.",
              "Trigger when <strong>either</strong> is true (OR, not AND): first Enterprise prospect that lists SOC 2 Type II as procurement-blocking, <em>or</em> closing the second deal where security questionnaire time exceeds engineering time on that deal.",
            ],
            [
              "Public status page",
              "Not bundled here — pick provider + DNS when revenue/support load justifies.",
              "≥ 3 paying customers, OR first incident where the absence of a public status page caused inbound support load &gt; 30 min triage cost.",
            ],
            [
              "Bug bounty",
              "Responsible disclosure via security contact; formal program is optional later.",
              "First unsolicited security report from outside the customer base, OR a paid customer asking for a coordinated disclosure policy URL.",
            ],
            [
              "Multi-region DB",
              "Schema is migration-governed; DR topology is a customer/scale decision.",
              "First contracted RPO/RTO that single-region cannot meet, OR a customer in a data-residency jurisdiction (EU / UK Crown / US-FedRAMP) that forbids the current region.",
            ],
            [
              "Dedicated support inbox / helpdesk",
              "Shared founder inbox is fine at low volume.",
              "Revisit when there are more than a handful of paying customers or sustained ticket volume (e.g. &gt; ~10 substantive threads/week) makes routing opaque.",
            ],
          ]}
        />
        <Callout tone="info" title="Before triggers fire">
          <Text size="small">
            Keep one-page scope stubs (SOC 2, bug bounty, multi-region DR, status
            vendor) in your internal docs so the week a trigger hits, engineering is
            executing — not re-deriving requirements from scratch.
          </Text>
        </Callout>
      </Stack>

      <Divider />

      {/* ========== CHECKLIST ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>13. Reviewer checklist</H2>
          <Pill tone="neutral" size="sm">
            [GOVERNANCE]
          </Pill>
        </Row>
        <Callout tone="info" title="If you have ~90 minutes">
          <Text size="small">
            Read <strong>§2–3, §6, §8, §10–11</strong> in order — you will cover
            tenant isolation, Charon safety, migration governance, security index,
            and CI/footprint.
          </Text>
        </Callout>
        <Table
          headers={["Step", "File / area", "What you should see"]}
          columnAlign={["right", "left", "left"]}
          rows={[
            [
              "1",
              <span key="r1"><Code>src/db/index.ts</Code></span>,
              <span key="w1"><Code>withTenantRls</Code> is the default; <Code>withBypassRls</Code> JSDoc lists allowed callers and defines the <Code>// RLS-BYPASS:</Code> grep convention. Run <Code>rg &quot;RLS-BYPASS:&quot; src</Code> and match counts to <Code>withBypassRls(</Code>; if the documented invariant fails, treat it as a review blocker and escalate.</span>,
            ],
            [
              "2",
              <span key="r2"><Code>src/lib/server/services/janitor-scan-job.ts</Code></span>,
              "Tenant-scoped queries; suppressions before finalize; scan does not live-delete.",
            ],
            [
              "3",
              <span key="r3"><Code>src/lib/server/outbound-webhook.ts</Code></span>,
              "HMAC signing; no cross-tenant URL fan-out from one tenant context.",
            ],
            [
              "4",
              <span key="r4"><Code>src/app/api/v1/janitor/cleanup</Code> + <Code>cleanup/approve</Code></span>,
              "Approval gate before destructive work; errors stable-shaped.",
            ],
            [
              "5",
              <span key="r5"><Code>openapi/blackglass.yaml</Code></span>,
              "Janitor paths documented; types regenerated.",
            ],
          ]}
        />
      </Stack>

      <Divider />

      {/* ========== PERSONA VALIDATION RECIPES ========== */}
      <Stack gap={10}>
        <Row gap={8} align="center" wrap>
          <H2>13a. How to validate Blackglass — by persona</H2>
          <Pill tone="neutral" size="sm">
            [GOVERNANCE]
          </Pill>
        </Row>
        <Text size="small" tone="secondary">
          Three small, independent recipes. Each one fits in a single working
          session and produces an artefact you can show to your stakeholder.
          Pick the row that matches your seat.
        </Text>
        <Table
          headers={["Persona", "30-minute recipe", "What you should walk away with"]}
          columnAlign={["left", "left", "left"]}
          rows={[
            [
              "Exec / procurement",
              <span key="exec1">
                (1) Open <Code>/pricing</Code> and verify the published tiers
                match what your account team quoted. (2) Skim <Code>§0</Code>{" "}
                (Strategic refresh) + <Code>§4</Code> (Legal routes) +{" "}
                <Code>§12</Code> (Org decisions / Trigger criteria). (3) Email
                your security contact <Code>docs/security-compliance.md</Code>{" "}
                and ask for a signed copy of the latest one alongside the MSA.
              </span>,
              "A go/no-go on whether pricing + legal posture clears your bar without further engineering time. Ask to receive back: this packet version string, the latest signed or current <Code>docs/security-compliance.md</Code>, and a sub-processor list that matches the public <Code>/subprocessors</Code> page. If §12 trigger criteria match a procurement requirement (e.g. SOC 2), you have a concrete next-step instead of a blocker.",
            ],
            [
              "Security reviewer",
              <span key="sec1">
                (1) Run <Code>rg &quot;RLS-BYPASS:&quot; src</Code> and count rows;
                read 3 of them at random and check the reason matches the
                surrounding code. (2) Read <Code>§6</Code> (Charon
                Guarantees vs Non-guarantees). (3) Walk Step 1–4 of the §13
                checklist and confirm the named files do what the table
                claims. (4) Open <Code>docs/security-compliance.md</Code>{" "}
                §3 + §8a and check it agrees with what you saw in code.
              </span>,
              "An evidence-anchored opinion on tenant isolation + Charon safety. The greppable RLS-BYPASS tag means you can audit cross-tenant code paths in minutes, not days. If live <Code>rg</Code> counts disagree with the invariant in §2 / this checklist, treat that as a red flag and escalate before sign-off.",
            ],
            [
              "Engineer onboarding",
              <span key="eng1">
                <strong>Recommended first-day exercise.</strong> (1) Read{" "}
                <Code>§5</Code> (Runtime architecture) + <Code>§7</Code>{" "}
                (Schema/migrations) + <Code>§8</Code> (Queues). (2) Bring up the dev
                stack from <Code>README.md</Code> and run{" "}
                <Code>npm run typecheck</Code> + <Code>npm run test:unit</Code>. (3)
                Open one BullMQ job handler (e.g.{" "}
                <Code>src/worker/sandbox-worker.ts</Code>) and trace it from enqueue (
                <Code>src/lib/server/queue/</Code>) to the row update. (4) Pick a route
                from <Code>openapi/blackglass.yaml</Code> and follow it from handler →
                service → DB.
              </span>,
              "A working mental model of how a request becomes a row + queued job, plus the test/typecheck loop you'll use day-to-day. After this you can trust §13's checklist as a reviewer rather than just an outsider.",
            ],
          ]}
        />
      </Stack>

      <Row gap={8} align="center" wrap>
        <Pill tone="neutral" size="sm">
          End of packet v2.5
        </Pill>
        <Text size="small" tone="tertiary">
          Prefer depth in companion markdown; keep this canvas navigable.
          Refresh §0 when the trigger criteria say so (see §0 cadence
          callout); other sections are evergreen until the underlying code
          changes.
        </Text>
      </Row>
    </Stack>
  );
}
