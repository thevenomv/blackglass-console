/**
 * Email template for the scheduled drift-events digest.
 *
 * Sent by the ops-worker on a configurable cadence (`DRIFT_DIGEST_INTERVAL`).
 * Summarises the previous window of drift activity per tenant — counts by
 * severity, the top categories, and a deep-link back into the console.
 */

export interface DriftDigestCategoryRow {
  category: string;
  count: number;
}

export interface DriftDigestOptions {
  workspaceName: string;
  appUrl: string;
  windowLabel: string; // e.g. "last 24 hours" or "last 7 days"
  windowStartIso: string;
  windowEndIso: string;
  totals: {
    new: number;
    high: number;
    medium: number;
    low: number;
    remediated: number;
  };
  topCategories: DriftDigestCategoryRow[];
  affectedHosts: number;
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-GB");
}

export function driftDigestHtml(opts: DriftDigestOptions): string {
  const { totals } = opts;
  const headlineHigh = totals.high > 0;
  const headlineColor = headlineHigh ? "#92400e" : "#166534";
  const headlineBg = headlineHigh ? "#fef3c7" : "#dcfce7";
  const headlineMessage = headlineHigh
    ? `${fmtNum(totals.high)} high-severity finding${totals.high === 1 ? "" : "s"} need attention`
    : `No high-severity drift in ${opts.windowLabel}`;

  const catRows = opts.topCategories
    .slice(0, 5)
    .map(
      (c) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">${escapeHtml(c.category)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;font-variant-numeric:tabular-nums;">${fmtNum(c.count)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f7fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a202c;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#0f1419;padding:18px 24px;">
      <p style="margin:0;color:#9aa5b1;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">Blackglass · Findings digest</p>
      <p style="margin:4px 0 0;color:#fff;font-size:18px;font-weight:600;">${escapeHtml(opts.workspaceName)} — ${escapeHtml(opts.windowLabel)}</p>
    </div>

    <div style="padding:20px 24px 4px;">
      <div style="display:inline-block;background:${headlineBg};color:${headlineColor};padding:10px 14px;border-radius:6px;font-size:14px;font-weight:600;">
        ${escapeHtml(headlineMessage)}
      </div>
      <p style="margin:14px 0 0;color:#4a5568;font-size:13px;">
        Window: ${escapeHtml(opts.windowStartIso)} → ${escapeHtml(opts.windowEndIso)}
      </p>
    </div>

    <div style="padding:8px 24px 0;">
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:12px;">
        <tr>
          ${kpiCell("New", totals.new)}
          ${kpiCell("High", totals.high, headlineHigh ? "#b91c1c" : undefined)}
          ${kpiCell("Medium", totals.medium)}
          ${kpiCell("Remediated", totals.remediated, "#166534")}
        </tr>
      </table>
      <p style="margin:14px 0 0;color:#4a5568;font-size:13px;">
        Across <strong>${fmtNum(opts.affectedHosts)}</strong> host${opts.affectedHosts === 1 ? "" : "s"}.
      </p>
    </div>

    ${
      catRows
        ? `
    <div style="padding:16px 24px 4px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#718096;">
        Top categories
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f7fafc;">
            <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:600;color:#718096;border-bottom:1px solid #e2e8f0;">Category</th>
            <th style="text-align:right;padding:8px 12px;font-size:11px;font-weight:600;color:#718096;border-bottom:1px solid #e2e8f0;">Findings</th>
          </tr>
        </thead>
        <tbody>${catRows}</tbody>
      </table>
    </div>`
        : ""
    }

    <div style="padding:20px 24px 24px;">
      <a href="${opts.appUrl}/drift?lifecycle=open" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
        Open findings →
      </a>
    </div>

    <div style="background:#f7fafc;padding:12px 24px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;color:#a0aec0;">
        You are receiving this because alert email is configured for this workspace. Manage notifications in
        <a href="${opts.appUrl}/settings#integrations" style="color:#1d4ed8;text-decoration:underline;">Settings → Integrations</a>.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function driftDigestText(opts: DriftDigestOptions): string {
  const lines = [
    `Blackglass — Findings digest (${opts.workspaceName})`,
    `Window: ${opts.windowStartIso} → ${opts.windowEndIso} (${opts.windowLabel})`,
    ``,
    `Totals:`,
    `  New:        ${opts.totals.new}`,
    `  High:       ${opts.totals.high}`,
    `  Medium:     ${opts.totals.medium}`,
    `  Low:        ${opts.totals.low}`,
    `  Remediated: ${opts.totals.remediated}`,
    `Affected hosts: ${opts.affectedHosts}`,
  ];
  if (opts.topCategories.length) {
    lines.push(``, `Top categories:`);
    for (const c of opts.topCategories.slice(0, 5)) {
      lines.push(`  • ${c.category} — ${c.count}`);
    }
  }
  lines.push(``, `Open the drift queue: ${opts.appUrl}/drift?lifecycle=open`);
  return lines.join("\n");
}

function kpiCell(label: string, value: number, color?: string): string {
  const fg = color ?? "#1a202c";
  return `
        <td style="text-align:center;padding:14px 8px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;width:25%;">
          <div style="font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#718096;">${escapeHtml(label)}</div>
          <div style="margin-top:2px;font-size:22px;font-weight:700;color:${fg};">${fmtNum(value)}</div>
        </td>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}
