/**
 * Server-side PDF report generator using pdf-lib.
 *
 * Converts the stored report JSON payload into a professional, printable PDF:
 *   - Cover page: report title, scope, generated timestamp, Blackglass branding
 *   - Drift events section: severity, category, title, timestamp
 *   - Recent audit section: actor, action, timestamp
 *
 * pdf-lib is pure JS/TS with no native dependencies — safe for DO App Platform.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { drawBrandWordmarkOnCover, embedBrandWordmark } from "@/lib/server/brand-wordmark";

// ---------------------------------------------------------------------------
// WinAnsi sanitisation
//
// pdf-lib's StandardFonts (Helvetica, Courier, …) ship with the legacy
// WinAnsi encoding (Windows-1252 + a small extension). Any codepoint outside
// that table — common ones include the right-arrow → (U+2192), em-dash —
// (U+2014), smart quotes “ ” ‘ ’, ellipsis …, bullet •, copy ©, etc. when
// they happen to fall outside CP1252 — makes embedFont throw with
// "WinAnsi cannot encode <char>" and aborts the entire render.
//
// We could embed a Unicode TTF and switch to subsetting, but that bloats
// the bundle, adds a font-license review surface, and is overkill for the
// glyphs operator/admin text actually contains. Instead, we collapse the
// 30-or-so realistic offenders to ASCII fall-backs and then strip whatever
// remains. This is a one-liner per drawText call site so it's cheap to
// keep current and impossible to forget for new fields (PageManager.text
// applies it; raw drawText calls go through `winAnsi(...)` first).
// ---------------------------------------------------------------------------

const WIN_ANSI_REPLACEMENTS: Record<string, string> = {
  "\u2010": "-",   // hyphen
  "\u2011": "-",   // non-breaking hyphen
  "\u2012": "-",   // figure dash
  "\u2013": "-",   // en dash
  "\u2014": "--",  // em dash
  "\u2015": "--",  // horizontal bar
  "\u2018": "'",   // left single quote
  "\u2019": "'",   // right single quote / apostrophe
  "\u201A": ",",   // single low-9 quote
  "\u201B": "'",   // single high-reversed quote
  "\u201C": '"',   // left double quote
  "\u201D": '"',   // right double quote
  "\u201E": '"',   // double low-9 quote
  "\u2020": "+",   // dagger
  "\u2021": "++",  // double dagger
  "\u2022": "*",   // bullet
  "\u2023": ">",   // triangular bullet
  "\u2024": ".",   // one-dot leader
  "\u2025": "..",  // two-dot leader
  "\u2026": "...", // ellipsis
  "\u2032": "'",   // prime
  "\u2033": '"',   // double prime
  "\u2039": "<",   // single left-pointing angle quote
  "\u203A": ">",   // single right-pointing angle quote
  "\u2044": "/",   // fraction slash
  "\u2190": "<-",  // leftwards arrow
  "\u2191": "^",   // upwards arrow
  "\u2192": "->",  // rightwards arrow ← THE BUG
  "\u2193": "v",   // downwards arrow
  "\u2194": "<->", // left-right arrow
  "\u21D0": "<=",  // leftwards double arrow
  "\u21D2": "=>",  // rightwards double arrow
  "\u21D4": "<=>", // left-right double arrow
  "\u2212": "-",   // minus sign
  "\u2260": "!=",  // not equal
  "\u2264": "<=",  // less or equal
  "\u2265": ">=",  // greater or equal
  "\u2713": "v",   // check mark
  "\u2714": "v",   // heavy check mark
  "\u2717": "x",   // ballot x
  "\u2718": "x",   // heavy ballot x
  "\u00A0": " ",   // non-breaking space → regular space (avoids weird CP1252 0xA0 quirks)
};

/** True for any codepoint pdf-lib's WinAnsi table can render unchanged. */
function isWinAnsiSafe(cp: number): boolean {
  // Printable ASCII + tab/lf/cr.
  if (cp === 0x09 || cp === 0x0A || cp === 0x0D) return true;
  if (cp >= 0x20 && cp <= 0x7E) return true;
  // CP1252 high range — pdf-lib supports the full table including the
  // 0x80–0x9F sub-range that's unassigned in true Latin-1.
  if (cp >= 0xA0 && cp <= 0xFF) return true;
  return false;
}

/** Sanitise an arbitrary string into something pdf-lib's WinAnsi fonts will draw. */
export function winAnsi(input: string | null | undefined): string {
  if (input == null) return "";
  let out = "";
  for (const ch of input) {
    const replacement = WIN_ANSI_REPLACEMENTS[ch];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    const cp = ch.codePointAt(0) ?? 0;
    if (isWinAnsiSafe(cp)) {
      out += ch;
    } else {
      // Last-resort placeholder — use "?" rather than "" so the operator can
      // see something was elided. Kept to a single character to avoid
      // breaking column layouts.
      out += "?";
    }
  }
  return out;
}

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
// Color palette — matches Blackglass dark-mode token feel on white paper
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
    this.currentPage.drawText(winAnsi("Blackglass · Confidential · Not for distribution"), {
      x: MARGIN,
      y: 20,
      size: 7,
      font: this.fonts.regular,
      color: C_FAINT,
    });
    this.currentPage.drawText(winAnsi(`Page ${this.pages.length}`), {
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
    this.currentPage.drawText(winAnsi(text), {
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
  doc.setTitle("Blackglass Integrity Report");
  doc.setAuthor("Blackglass");
  doc.setCreator("Blackglass Console");
  doc.setCreationDate(new Date());

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const fonts = { regular, bold, mono };

  const wordmark = await embedBrandWordmark(doc);

  const pm = new PageManager(doc, fonts);

  // -----------------------------------------------------------------------
  // Cover page
  // -----------------------------------------------------------------------

  pm.currentPage.drawRectangle({
    x: 0,
    y: PAGE_H - 6,
    width: PAGE_W,
    height: 6,
    color: C_BRAND,
  });
  pm.y = PAGE_H - 56;

  if (wordmark) {
    const imgH = drawBrandWordmarkOnCover(pm.currentPage, wordmark, {
      marginLeft: MARGIN,
      titleBaselineY: pm.y,
      maxWidthPt: 200,
    });
    pm.advance(imgH + 14);
  } else {
    pm.text("Blackglass", { size: 30, font: bold, color: C_BRAND });
    pm.currentPage.drawRectangle({
      x: MARGIN,
      y: pm.y - 5,
      width: 216,
      height: 3.5,
      color: C_BRAND,
    });
    pm.advance(LINE_LG + 8);
  }
  pm.text("Linux server integrity report", { size: 16, font: bold, color: C_BLACK });
  pm.advance(LINE_SM + 4);
  pm.text("Confidential — share only with people cleared for this workspace.", {
    size: 9,
    font: regular,
    color: C_MUTED,
  });
  pm.advance(LINE_MD + 10);

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
        pm.currentPage.drawText(winAnsi(titleLines[i]!), {
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
        pm.currentPage.drawText(winAnsi(detailLines[i]!), {
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
