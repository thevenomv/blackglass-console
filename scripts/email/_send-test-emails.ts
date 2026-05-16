/**
 * Inner worker for scripts/email/send-test-emails.mjs - invoked through tsx.
 *
 * Imports the templates (which only use relative imports) but calls
 * Resend directly so we don't have to wire @/ aliases for tsx in
 * scripts/. Self-contained on purpose: this is a deployment-readiness
 * probe, not an application path.
 *
 * Co-located with its wrapper in scripts/email/. The leading underscore
 * marks it as "do not invoke directly" - use `node scripts/email/send-test-emails.mjs`.
 */
import process from "node:process";
import { Resend } from "resend";
import {
  welcomeEmailHtml,
  welcomeEmailText,
  trialExpiringEmailHtml,
  trialExpiringEmailText,
  trialExpiredEmailHtml,
  trialExpiredEmailText,
} from "../../src/lib/email/templates";
import { driftAlertHtml, driftAlertText } from "../../src/lib/email/templates/drift-alert";
import { driftDigestHtml, driftDigestText } from "../../src/lib/email/templates/drift-digest";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : fallback;
}

const to = arg("to", "");
const template = arg("template", "all");

if (!to) {
  console.error("Inner worker requires --to=<email>");
  process.exit(2);
}

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
if (!RESEND_API_KEY) {
  console.error("RESEND_API_KEY not set");
  process.exit(2);
}

const FROM = process.env.EMAIL_FROM ?? "Blackglass <noreply@blackglasssec.com>";
const consoleUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://blackglasssec.com").replace(/\/+$/, "");
const resend = new Resend(RESEND_API_KEY);

// Centralised fixture for test renders. The "(test)" suffix on
// orgName makes it instantly clear to the recipient that this isn't a
// real customer notification, and we use `.invalid` for example
// hostnames (RFC 2606) so they can't accidentally resolve.
const TEST = {
  firstName: "Jamie",
  orgName: "Obsidian Dynamics (test)",
  hostname: "demo-host-01.test.invalid",
} as const;

interface Result {
  template: string;
  ok: boolean;
  id?: string;
  error?: string;
}

async function send(subject: string, html: string, text: string): Promise<{ id?: string }> {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [to],
    subject,
    html,
    text,
  });
  if (error) throw new Error(error.message);
  return { id: data?.id };
}

const senders: Record<string, () => Promise<{ id?: string }>> = {
  welcome: () =>
    send(
      "[Blackglass] Test send - Welcome email",
      welcomeEmailHtml({ firstName: TEST.firstName, orgName: TEST.orgName, consoleUrl, trialDays: 14 }),
      welcomeEmailText({ firstName: TEST.firstName, orgName: TEST.orgName, consoleUrl, trialDays: 14 }),
    ),
  "drift-alert": () => {
    const findings = [
      { title: "Unexpected listening port :8080", category: "network", severity: "high" },
      { title: "Sudoers entry added for `deploy` user", category: "identity", severity: "high" },
      { title: "Disabled UFW firewall", category: "hardening", severity: "high" },
    ];
    return send(
      "[Blackglass] Test send - High-severity drift alert",
      driftAlertHtml({ hostname: TEST.hostname, jobId: "scan-test-0001", appUrl: consoleUrl, findings }),
      driftAlertText({ hostname: TEST.hostname, jobId: "scan-test-0001", appUrl: consoleUrl, findings }),
    );
  },
  "drift-digest": () => {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const opts = {
      workspaceName: TEST.orgName,
      appUrl: consoleUrl,
      windowLabel: "last 7 days",
      windowStartIso: start.toISOString(),
      windowEndIso: now.toISOString(),
      totals: { new: 12, high: 3, medium: 6, low: 3, remediated: 7 },
      topCategories: [
        { category: "network", count: 5 },
        { category: "identity", count: 4 },
        { category: "hardening", count: 3 },
      ],
      affectedHosts: 8,
    };
    return send(
      "[Blackglass] Test send - Findings digest (last 7 days)",
      driftDigestHtml(opts),
      driftDigestText(opts),
    );
  },
  "trial-expiring": () => {
    const opts = {
      firstName: TEST.firstName,
      orgName: TEST.orgName,
      daysLeft: 3,
      consoleUrl,
      checkoutUrl: `${consoleUrl}/pricing`,
    };
    return send(
      "[Blackglass] Test send - Trial expiring (3 days left)",
      trialExpiringEmailHtml(opts),
      trialExpiringEmailText(opts),
    );
  },
  "trial-expired": () => {
    const opts = {
      firstName: TEST.firstName,
      orgName: TEST.orgName,
      consoleUrl,
      checkoutUrl: `${consoleUrl}/pricing`,
    };
    return send(
      "[Blackglass] Test send - Trial expired",
      trialExpiredEmailHtml(opts),
      trialExpiredEmailText(opts),
    );
  },
};

(async () => {
  const names = template === "all" ? Object.keys(senders) : [template];
  const results: Result[] = [];
  for (const name of names) {
    const fn = senders[name];
    if (!fn) {
      results.push({ template: name, ok: false, error: "unknown template" });
      continue;
    }
    try {
      const r = await fn();
      results.push({ template: name, ok: true, id: r.id });
      console.log(`  SENT    ${name.padEnd(16)} id=${r.id ?? "(no id)"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ template: name, ok: false, error: message });
      console.log(`  FAILED  ${name.padEnd(16)} error=${message}`);
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  const failedCount = results.filter((r) => !r.ok).length;
  console.log(`\n[send-test-emails] sent=${okCount} failed=${failedCount}`);
  process.exit(failedCount === 0 ? 0 : 1);
})().catch((err) => {
  console.error("[send-test-emails] fatal:", err);
  process.exit(1);
});
