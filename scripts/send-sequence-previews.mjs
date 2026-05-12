#!/usr/bin/env node
/**
 * Send all Apollo cold-outreach sequence steps to a single review inbox.
 * Use this to proof emails in a real mail client before activating sequences
 * in Apollo. Sends from the same noreply@ domain as product mail — this is
 * for internal preview only, NOT for live prospect outreach.
 *
 * Usage:
 *   node scripts/send-sequence-previews.mjs --to=jamie@obsidiandynamics.co.uk
 *
 * Env (set in .env.local):
 *   RESEND_API_KEY   — required. Rotate at resend.com/api-keys if compromised.
 *
 * What gets sent (9 emails, one per sequence step):
 *   Sequence A (Platform / Reliability): A1, A2, A3, A4-breakup
 *   Sequence B (Security / Governance):  B1, B2, B3
 *   Sequence C (DevOps / EngMgr):        C1, C2, C3
 *
 * Each email subject is prefixed with [PREVIEW] and the persona/step so you
 * can find them quickly in your inbox.
 */

import process from "node:process";
import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
function loadDotenvLocal() {
  const result = spawnSync(
    process.execPath,
    ["-e", "require('dotenv').config({ path: '.env.local' }); process.stdout.write(JSON.stringify(process.env));"],
    { encoding: "utf8" },
  );
  if (result.status === 0 && result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch { /* ignore */ }
  }
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : fallback;
}

if (!process.env.RESEND_API_KEY) loadDotenvLocal();

const RESEND_KEY = process.env.RESEND_API_KEY?.trim();
if (!RESEND_KEY) {
  console.error(
    "RESEND_API_KEY is not set.\n" +
    "Add it to .env.local:\n\n" +
    "  RESEND_API_KEY=re_your_new_key_here\n\n" +
    "Get a fresh key at: https://resend.com/api-keys\n" +
    "(Rotate the old one first if it was ever pasted into chat or logs.)",
  );
  process.exit(2);
}

const to = arg("to", "").trim();
if (!to) {
  console.error("Usage: node scripts/send-sequence-previews.mjs --to=you@example.com");
  process.exit(2);
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://blackglasssec.com").replace(/\/+$/, "");
const DEMO_URL = `${APP_URL}/demo`;
const SECURITY_URL = `${APP_URL}/security`;
const PRICING_URL = `${APP_URL}/pricing`;
const FROM = process.env.EMAIL_FROM?.trim() || "Blackglass <noreply@blackglasssec.com>";
const FOOTER = "Blackglass is a product of Obsidian Dynamics Limited (Co. No. 16663833) · Lytchett House, 13 Freeland Park, Wareham Road, Poole, Dorset BH16 6FA, United Kingdom";

// ---------------------------------------------------------------------------
// Merge fields filled with preview values so you see them rendered
// ---------------------------------------------------------------------------
const FIRST_NAME = "Alex";
const COMPANY = "Acme Corp";
const TITLE = "Head of Platform";
const SENDER = "Jamie";

// ---------------------------------------------------------------------------
// Sequence definitions
// ---------------------------------------------------------------------------
const sequences = [
  // ── Sequence A ──────────────────────────────────────────────────────────
  {
    id: "A1",
    label: "Sequence A — Step 1 (Platform / Reliability)",
    subject: `[PREVIEW A1] how many of your hosts match baseline right now?`,
    body: `Hi ${FIRST_NAME},

Most SREs I talk to can't answer that off the top of their head.

Not because they're careless — because the signal doesn't exist until something breaks.

Blackglass gives you that signal: continuous baselines, drift grouped by severity, evidence exports you can share with leadership in seconds. Built for operators, not compliance theatre.

Worth two minutes?

${SENDER}

${DEMO_URL}`,
  },
  {
    id: "A2",
    label: "Sequence A — Step 2 (follow-up, 3-day gap)",
    subject: `[PREVIEW A2] Terraform says one thing. Your hosts say another.`,
    body: `Hi ${FIRST_NAME},

The gap most platform teams have isn't tooling — it's visibility between deployments.

Your IaC captured intent. The host that's been running for three months has its own story.

Blackglass closes that gap without a CMDB project. Tell me what ${COMPANY} uses for config today — Ansible, baked images, "mostly muscle memory" — and I'll point you at the right screen in the demo.

${SENDER}`,
  },
  {
    id: "A3",
    label: "Sequence A — Step 3 (5–7 day gap)",
    subject: `[PREVIEW A3] 10 minutes or a link — your call`,
    body: `Hi ${FIRST_NAME},

One more before I get out of your inbox.

If you want to click through at your own pace, the interactive demo takes two minutes and needs no signup:

${DEMO_URL}

If you'd rather a live 15-minute walkthrough with me, reply with a couple of times that work.

${SENDER}`,
  },
  {
    id: "A4",
    label: "Sequence A — Step 4 Breakup (7+ day gap)",
    subject: `[PREVIEW A4] closing the loop on ${COMPANY}`,
    body: `Hi ${FIRST_NAME},

I'll stop chasing. Timing clearly isn't right.

If Linux drift becomes the thing keeping you up — or the question you can't answer cleanly in a review — you know where to find us.

${DEMO_URL}

${SENDER}`,
  },

  // ── Sequence B ──────────────────────────────────────────────────────────
  {
    id: "B1",
    label: "Sequence B — Step 1 (Security / Governance)",
    subject: `[PREVIEW B1] what changed on your Linux fleet last quarter?`,
    body: `Hi ${FIRST_NAME},

That's the question auditors are starting to ask. For most teams, the honest answer is "we'd have to check a dozen places and piece it together."

CIS benchmarks, ISO 27001, SOC 2 — they all assume you have a reliable record of what changed on your systems, and when. Linux is usually where that record breaks down.

Blackglass gives you a single timeline: baselines, drift findings, exports built for evidence packs. No agents to wrangle. No SIEM project required.

If ${COMPANY} is working toward any of those frameworks this year, happy to walk through what ships today.

${SENDER}

${DEMO_URL}`,
  },
  {
    id: "B2",
    label: "Sequence B — Step 2 (3-day gap)",
    subject: `[PREVIEW B2] re: the Linux change record problem`,
    body: `Hi ${FIRST_NAME},

Concrete example: a team got asked in a SOC 2 audit to produce a change record for one specific host over 90 days. They had nothing useful — just logs scattered across three tools and a lot of archaeology.

That's now a 20-second export in Blackglass.

If compliance posture is part of your remit at ${COMPANY}, I can tailor this to whichever framework you're targeting. Worth a reply?

${SENDER}`,
  },
  {
    id: "B3",
    label: "Sequence B — Step 3 / Breakup",
    subject: `[PREVIEW B3] last note`,
    body: `Hi ${FIRST_NAME},

I'll leave you alone after this one.

If you want to dig into the security detail first:
${SECURITY_URL}

If you're ready to talk seats and pricing:
${PRICING_URL}

Either way — appreciate you reading this far.

${SENDER}`,
  },

  // ── Sequence C ──────────────────────────────────────────────────────────
  {
    id: "C1",
    label: "Sequence C — Step 1 (DevOps / Eng Manager)",
    subject: `[PREVIEW C1] your golden image is lying to you`,
    body: `Hi ${FIRST_NAME},

It was accurate when you built it. That was six weeks ago.

Every host in your fleet has drifted some amount from that baseline. Most teams find out how much when a deploy behaves unexpectedly — or an incident review asks an awkward question.

Blackglass runs scheduled scans and shows you the diff: what changed, when, how severe. Before it becomes your 2am problem.

Two minutes, no signup:

${DEMO_URL}

${SENDER}`,
  },
  {
    id: "C2",
    label: "Sequence C — Step 2 (4-day gap)",
    subject: `[PREVIEW C2] re: the drift you don't know about`,
    body: `Hi ${FIRST_NAME},

Most engineering managers I talk to frame it the same way: "we know what should be there — we just don't know what is there."

The drift you can't see is the drift that causes incidents.

Blackglass makes it visible: severity-grouped findings, a triage queue for your team, and a paper trail if you need to explain it upward.

15 minutes live, or the demo does it without the scheduling overhead:

${DEMO_URL}

${SENDER}`,
  },
  {
    id: "C3",
    label: "Sequence C — Step 3 / Breakup (5–7 day gap)",
    subject: `[PREVIEW C3] last one`,
    body: `Hi ${FIRST_NAME},

Won't bother you again after this.

If Linux config hygiene ever lands firmly on your plate — before it pages you — Blackglass is worth 10 minutes of your time.

${DEMO_URL}

${SENDER}`,
  },
];

// ---------------------------------------------------------------------------
// HTML wrapper — branded Blackglass email template
// ---------------------------------------------------------------------------
function toHtml(text) {
  const rows = text.split("\n").map((line) => {
    const trimmed = line.trim();

    // Blank line → small spacer row
    if (trimmed === "") {
      return `<tr><td style="height:10px;"></td></tr>`;
    }

    // Line that is ONLY a URL → render as a CTA button
    if (/^https?:\/\/\S+$/.test(trimmed)) {
      const path = trimmed.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "");
      const label = path === "" ? "Open →" : path === "demo" ? "See the interactive demo →" : path === "security" ? "Read the security overview →" : path === "pricing" ? "View pricing →" : `${path} →`;
      return `<tr><td style="padding:8px 0 12px;">
        <a href="${trimmed}" style="display:inline-block;background:#0f172a;color:#f8fafc;font-size:13px;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:6px;letter-spacing:0.05em;text-transform:uppercase;">${label}</a>
      </td></tr>`;
    }

    // Regular text line — linkify any embedded URLs
    const escaped = trimmed
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#1d4ed8;text-decoration:underline;">$1</a>');

    return `<tr><td style="padding:0 0 12px;font-size:15px;line-height:1.7;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">${escaped}</td></tr>`;
  });

  const APP_URL_CLEAN = APP_URL.replace(/\/+$/, "");
  const LOGO_MARK = `<img src="${APP_URL_CLEAN}/brand/logo-email.png" width="200" height="40" alt="Blackglass" style="display:block;border:0;outline:none;text-decoration:none;" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Blackglass</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:32px 16px 48px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;">

        <!-- ── Brand header ── -->
        <tr><td style="background:#ffffff;border-radius:10px 10px 0 0;padding:24px 32px;border:1px solid #e2e8f0;border-bottom:none;">
          ${LOGO_MARK}
        </td></tr>

        <!-- ── Blue accent bar ── -->
        <tr><td style="height:3px;background:#3b82f6;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- ── Email body ── -->
        <tr><td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${rows.join("\n            ")}

            <!-- ── Divider ── -->
            <tr><td style="height:1px;background:#e2e8f0;padding:0;margin:0;font-size:0;line-height:0;">&nbsp;</td></tr>

            <!-- ── Footer ── -->
            <tr><td style="padding-top:20px;font-size:11px;color:#94a3b8;line-height:1.7;">
              Blackglass is a product of Obsidian Dynamics Limited (Co.&nbsp;No.&nbsp;16663833)<br/>
              Lytchett House, 13 Freeland Park, Wareham Road, Poole, Dorset BH16&nbsp;6FA, United Kingdom
            </td></tr>
          </table>
        </td></tr>

        <!-- ── Bottom cap ── -->
        <tr><td style="background:#ffffff;height:6px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0;border-top:none;"></td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Send via Resend
// ---------------------------------------------------------------------------
async function send(seq) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: seq.subject,
      text: seq.body + `\n\n${FOOTER}`,
      html: toHtml(seq.body),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  }
  return data.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log("\nBlackglass — sequence preview send");
console.log("===================================");
console.log(`To      : ${to}`);
console.log(`From    : ${FROM}`);
console.log(`Emails  : ${sequences.length}`);
console.log("");

let ok = 0;
let fail = 0;

for (const seq of sequences) {
  process.stdout.write(`  [${seq.id}] ${seq.label} ... `);
  try {
    const id = await send(seq);
    console.log(`sent (${id})`);
    ok++;
    // Small pause to stay well inside Resend rate limits
    await new Promise((r) => setTimeout(r, 400));
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    fail++;
  }
}

console.log(`\n${ok} sent, ${fail} failed.`);
if (fail === 0) {
  console.log(`\nCheck ${to} — you should have ${ok} emails with [PREVIEW] subjects.`);
  console.log("Reply with any copy tweaks and I'll update the sequences file.");
}
if (fail > 0) {
  console.log("\nIf you see a 403 or 'domain not verified', the Resend API key may be for");
  console.log("a different account, or noreply@blackglasssec.com needs re-verification.");
  console.log("Check: https://resend.com/domains");
}
