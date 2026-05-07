/**
 * Email template for high-severity drift alert notifications.
 *
 * Sent when executeDriftScanJob finds one or more high-severity drift events.
 * Requires ALERT_EMAIL_TO env var; uses RESEND_API_KEY via sendEmail().
 */

export interface DriftAlertFinding {
  title: string;
  category: string;
  severity: string;
}

export interface DriftAlertOptions {
  hostname: string;
  jobId: string;
  appUrl: string;
  findings: DriftAlertFinding[];
}

export function driftAlertHtml(opts: DriftAlertOptions): string {
  const rows = opts.findings
    .map(
      (f) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">${f.title}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#718096;">${f.category}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#e53e3e;font-weight:600;">${f.severity}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f7fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a202c;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#e53e3e;padding:16px 24px;">
      <p style="margin:0;color:#fff;font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;">BLACKGLASS Security Alert</p>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;">
        ${opts.findings.length} high-severity drift finding${opts.findings.length === 1 ? "" : "s"} detected
      </h2>
      <p style="margin:0 0 16px;color:#4a5568;font-size:14px;">
        Host: <strong>${opts.hostname}</strong> &middot; Scan: <code style="background:#edf2f7;padding:2px 4px;border-radius:3px;font-size:12px;">${opts.jobId}</code>
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f7fafc;">
            <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#718096;border-bottom:2px solid #e2e8f0;">Finding</th>
            <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#718096;border-bottom:2px solid #e2e8f0;">Category</th>
            <th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#718096;border-bottom:2px solid #e2e8f0;">Severity</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:24px;">
        <a href="${opts.appUrl}/drift?jobId=${encodeURIComponent(opts.jobId)}" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Review this scan &rarr;</a>
      </div>
    </div>
    <div style="background:#f7fafc;padding:12px 24px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;color:#a0aec0;">
        You are receiving this because ALERT_EMAIL_TO is configured. Manage notifications in your BLACKGLASS settings.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function driftAlertText(opts: DriftAlertOptions): string {
  const lines = opts.findings.map((f) => `  • ${f.title} (${f.category}, ${f.severity})`).join("\n");
  return [
    `BLACKGLASS Security Alert`,
    ``,
    `${opts.findings.length} high-severity drift finding(s) detected on ${opts.hostname}`,
    `Scan ID: ${opts.jobId}`,
    ``,
    lines,
    ``,
    `Review at: ${opts.appUrl}/drift?jobId=${encodeURIComponent(opts.jobId)}`,
  ].join("\n");
}
