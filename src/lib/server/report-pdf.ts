/**
 * Server-side PDF report generator using pdf-lib.
 *
 * Converts the stored report JSON payload into a professional, printable PDF:
 *   - Cover page: report title, scope, generated timestamp, BLACKGLASS branding
 *   - Drift events section: severity, category, title, timestamp
 *   - Recent audit section: actor, action, timestamp
 *
 * pdf-lib is pure JS/TS with no native dependencies — safe for DO App Platform.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

// ---------------------------------------------------------------------------
// Types mirroring the report JSON content
// ---------------------------------------------------------------------------

type DriftEventEntry = {
  id?: string;
  title?: string;
  severity?: string;
  category?: string;
  detectedAt?: string;
  lifecycle?: string;
};

type AuditEntry = {
  at?: string;
  actor?: string;
  action?: string;
  detail?: string;
};

type ReportJson = {
  report_id?: string;
  scope?: string;
  generated_at?: string;
  drift_events?: DriftEventEntry[];
  recent_audit?: AuditEntry[];
};

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PAGE_W = 595.28; // A4 width  (pt)
const PAGE_H = 841.89; // A4 height (pt)
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_SM = 14;
const LINE_MD = 18;
const LINE_LG = 26;

// ---------------------------------------------------------------------------
// Color palette — matches BLACKGLASS dark-mode token feel on white paper
// ---------------------------------------------------------------------------

const C_BLACK = rgb(0.1, 0.1, 0.1);
const C_MUTED = rgb(0.35, 0.35, 0.38);
const C_FAINT = rgb(0.6, 0.6, 0.62);
const C_RULE = rgb(0.82, 0.82, 0.85);
const C_BRAND = rgb(0.22, 0.47, 0.98);   // accent-blue
const C_CRIT = rgb(0.86, 0.22, 0.22);
const C_HIGH = rgb(0.91, 0.45, 0.1);
const C_MED = rgb(0.85, 0.7, 0.1);
const C_LOW = rgb(0.35, 0.35, 0.38);

function sevColor(s = "") {
  switch (s.toLowerCase()) {
    case "critical": return C_CRIT;
    case "high": return C_HIGH;
    case "medium": return C_MED;
    default: return C_LOW;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + (cur ? " " : "") + w).length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC";
  } catch {
    return iso;
  }
}

function hRule(page: PDFPage, y: number) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color: C_RULE,
  });
}

// ---------------------------------------------------------------------------
// Page manager — auto-adds new pages when content overflows
// ---------------------------------------------------------------------------

class PageManager {
  private pages: PDFPage[] = [];
  private doc: PDFDocument;
  private fonts: { regular: PDFFont; bold: PDFFont; mono: PDFFont };
  currentPage!: PDFPage;
  y = 0;

  constructor(doc: PDFDocument, fonts: { regular: PDFFont; bold: PDFFont; mono: PDFFont }) {
    this.doc = doc;
    this.fonts = fonts;
    this.addPage();
  }

  addPage() {
    this.currentPage = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.currentPage);
    this.y = PAGE_H - MARGIN;
    // Footer on every page
    this.currentPage.drawText("BLACKGLASS · Confidential · Not for distribution", {
      x: MARGIN,
      y: 20,
      size: 7,
      font: this.fonts.regular,
      color: C_FAINT,
    });
    this.currentPage.drawText(`Page ${this.pages.length}`, {
      x: PAGE_W - MARGIN - 30,
      y: 20,
      size: 7,
      font: this.fonts.regular,
      color: C_FAINT,
    });
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN + 20) this.addPage();
  }

  text(
    text: string,
    {
      size = 10,
      font,
      color = C_BLACK,
      x = MARGIN,
      indent = 0,
    }: { size?: number; font?: PDFFont; color?: typeof C_BLACK; x?: number; indent?: number } = {},
  ) {
    this.currentPage.drawText(text, {
      x: x + indent,
      y: this.y,
      size,
      font: font ?? this.fonts.regular,
      color,
    });
  }

  advance(px: number) {
    this.y -= px;
  }
}

// ---------------------------------------------------------------------------
// Public generator
// ---------------------------------------------------------------------------

export async function generateReportPdf(contentJson: string): Promise<Uint8Array> {
  let data: ReportJson = {};
  try {
    data = JSON.parse(contentJson) as ReportJson;
  } catch {
    data = { report_id: "unknown", scope: "unknown", generated_at: new Date().toISOString() };
  }

  const doc = await PDFDocument.create();
  doc.setTitle("BLACKGLASS Integrity Report");
  doc.setAuthor("BLACKGLASS");
  doc.setCreator("BLACKGLASS Console");
  doc.setCreationDate(new Date());

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const fonts = { regular, bold, mono };

  const pm = new PageManager(doc, fonts);

  // -----------------------------------------------------------------------
  // Cover page
  // -----------------------------------------------------------------------

  pm.y = PAGE_H - 80;

  // Logo / brand wordmark
  pm.text("BLACKGLASS", { size: 22, font: bold, color: C_BRAND });
  pm.advance(LINE_LG);
  pm.text("Linux Server Integrity Report", { size: 16, font: bold, color: C_BLACK });
  pm.advance(LINE_MD + 4);

  hRule(pm.currentPage, pm.y);
  pm.advance(LINE_MD);

  const meta: [string, string][] = [
    ["Report ID", data.report_id ?? "—"],
    ["Scope", data.scope ?? "—"],
    ["Generated", fmtDate(data.generated_at)],
    ["Events captured", String(data.drift_events?.length ?? 0)],
    ["Audit entries", String(data.recent_audit?.length ?? 0)],
  ];

  for (const [label, value] of meta) {
    pm.text(label, { size: 9, font: bold, color: C_MUTED });
    pm.text(value, { size: 9, color: C_BLACK, x: MARGIN + 130 });
    pm.advance(LINE_SM);
  }

  pm.advance(LINE_MD);
  hRule(pm.currentPage, pm.y);
  pm.advance(LINE_MD * 2);

  // -----------------------------------------------------------------------
  // Drift events section
  // -----------------------------------------------------------------------

  const events = data.drift_events ?? [];

  pm.ensureSpace(LINE_LG + LINE_SM);
  pm.text("Drift Events", { size: 14, font: bold, color: C_BLACK });
  pm.advance(LINE_LG);

  if (events.length === 0) {
    pm.text("No drift events recorded in this report.", { size: 10, color: C_MUTED });
    pm.advance(LINE_SM);
  } else {
    // Column headers
    pm.text("SEV", { size: 8, font: bold, color: C_FAINT, x: MARGIN });
    pm.text("CATEGORY", { size: 8, font: bold, color: C_FAINT, x: MARGIN + 55 });
    pm.text("FINDING", { size: 8, font: bold, color: C_FAINT, x: MARGIN + 145 });
    pm.text("DETECTED", { size: 8, font: bold, color: C_FAINT, x: MARGIN + 400 });
    pm.advance(LINE_SM - 2);
    hRule(pm.currentPage, pm.y);
    pm.advance(LINE_SM - 2);

    for (const ev of events) {
      const titleLines = wrap(ev.title ?? "—", 42);
      const rowHeight = titleLines.length * LINE_SM;
      pm.ensureSpace(rowHeight + LINE_SM);

      const sev = (ev.severity ?? "low").toLowerCase();
      pm.text(sev.slice(0, 4).toUpperCase(), { size: 8, font: bold, color: sevColor(sev), x: MARGIN });
      pm.text((ev.category ?? "—").slice(0, 14), { size: 8, color: C_MUTED, x: MARGIN + 55 });

      for (let i = 0; i < titleLines.length; i++) {
        pm.currentPage.drawText(titleLines[i]!, {
          x: MARGIN + 145,
          y: pm.y - i * LINE_SM,
          size: 9,
          font: regular,
          color: C_BLACK,
        });
      }

      pm.text(fmtDate(ev.detectedAt).slice(0, 20), { size: 7, color: C_MUTED, x: MARGIN + 400 });
      pm.advance(rowHeight + 4);

      hRule(pm.currentPage, pm.y);
      pm.advance(6);
    }
  }

  // -----------------------------------------------------------------------
  // Audit section
  // -----------------------------------------------------------------------

  pm.advance(LINE_MD);
  pm.ensureSpace(LINE_LG + LINE_SM);
  pm.text("Recent Audit Log", { size: 14, font: bold, color: C_BLACK });
  pm.advance(LINE_LG);

  const audit = data.recent_audit ?? [];

  if (audit.length === 0) {
    pm.text("No audit entries in this report.", { size: 10, color: C_MUTED });
    pm.advance(LINE_SM);
  } else {
    pm.text("TIMESTAMP", { size: 8, font: bold, color: C_FAINT, x: MARGIN });
    pm.text("ACTOR", { size: 8, font: bold, color: C_FAINT, x: MARGIN + 145 });
    pm.text("ACTION · DETAIL", { size: 8, font: bold, color: C_FAINT, x: MARGIN + 225 });
    pm.advance(LINE_SM - 2);
    hRule(pm.currentPage, pm.y);
    pm.advance(LINE_SM - 2);

    for (const a of audit) {
      const detail = `${a.action ?? "—"} · ${a.detail ?? ""}`;
      const detailLines = wrap(detail, 50);
      const rowHeight = detailLines.length * LINE_SM;
      pm.ensureSpace(rowHeight + LINE_SM);

      pm.text(fmtDate(a.at).slice(0, 18), { size: 7, font: mono, color: C_MUTED, x: MARGIN });
      pm.text((a.actor ?? "—").slice(0, 14), { size: 8, color: C_MUTED, x: MARGIN + 145 });

      for (let i = 0; i < detailLines.length; i++) {
        pm.currentPage.drawText(detailLines[i]!, {
          x: MARGIN + 225,
          y: pm.y - i * LINE_SM,
          size: 8,
          font: regular,
          color: C_BLACK,
        });
      }

      pm.advance(rowHeight + 4);
      hRule(pm.currentPage, pm.y);
      pm.advance(6);
    }
  }

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------

  return doc.save();
}
