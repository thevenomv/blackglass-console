/**
 * Optional email ping after Charon scans when tenant policies opt in.
 */

import { eq } from "drizzle-orm";
import { withTenantRls } from "@/db";
import { saasTenantNotifications } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import type { ResolvedCharonPolicies } from "@/lib/janitor/charon-policies";

export async function maybeSendCharonScanDigest(
  tenantId: string,
  workspaceName: string,
  findings: { idleScore: number; resourceType: string; resourceName: string }[],
  policy: ResolvedCharonPolicies,
): Promise<void> {
  if (!policy.emailDigestOnScan || findings.length === 0) return;

  const [n] = await withTenantRls(tenantId, (db) =>
    db
      .select({ alertEmailTo: saasTenantNotifications.alertEmailTo })
      .from(saasTenantNotifications)
      .where(eq(saasTenantNotifications.tenantId, tenantId))
      .limit(1),
  );

  const to = n?.alertEmailTo?.trim();
  if (!to) {
    return;
  }

  const recipients = to
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length) return;

  const maxScore = findings.reduce((m, f) => Math.max(m, f.idleScore), 0);
  const lines = findings
    .slice(0, 25)
    .map((f) => `- ${f.resourceType} ${f.resourceName} (score ${f.idleScore})`)
    .join("\n");
  const subject = `Charon: ${findings.length} finding(s) in ${workspaceName}`;
  const text = `Charon finished a scan for workspace "${workspaceName}".\n\nFindings: ${findings.length} (max score ${maxScore}).\n\n${lines}${findings.length > 25 ? "\n…" : ""}\n\nOpen the Charon console to review and queue cleanup.`;

  try {
    await sendEmail({
      to: recipients,
      subject,
      text,
      html: `<pre>${escapeHtml(text)}</pre>`,
    });
  } catch (e) {
    console.warn("[charon-digest] send failed", e instanceof Error ? e.message : e);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
