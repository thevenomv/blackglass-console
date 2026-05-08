/**
 * Branded PDF export for the public demo evidence bundle (/api/public/demo-evidence).
 * Uses pdf-lib (same stack as report-pdf.ts) — no native dependencies.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { DemoAuditRow, DemoDriftFinding, DemoHost, DemoRemediation } from "@/lib/demo/seed";
import { winAnsi } from "@/lib/server/report-pdf";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const LINE_SM = 14;
const LINE_MD = 18;
const LINE_LG = 26;

const C_BLACK = rgb(0.1, 0.1, 0.1);
const C_MUTED = rgb(0.35, 0.35, 0.38);
const C_FAINT = rgb(0.6, 0.6, 0.62);
const C_RULE = rgb(0.82, 0.82, 0.85);
const C_BRAND = rgb(0.22, 0.47, 0.98);
const C_CRIT = rgb(0.86, 0.22, 0.22);
const C_HIGH = rgb(0.91, 0.45, 0.1);
const C_MED = rgb(0.85, 0.7, 0.1);
const C_LOW = rgb(0.35, 0.35, 0.38);

function sevColor(s: string) {
  switch (s.toLowerCase()) {
    case "critical":
      return C_CRIT;
    case "high":
      return C_HIGH;
    case "medium":
      return C_MED;
    default:
      return C_LOW;
  }
}

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

function fmtDate(iso: string): string {
  try {
    return (
      new Date(iso).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }) + " UTC"
    );
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

class PageManager {
  private pages: PDFPage[] = [];
  private doc: PDFDocument;
  private fonts: { regular: PDFFont; bold: PDFFont };

  currentPage!: PDFPage;
  y = 0;

  constructor(doc: PDFDocument, fonts: { regular: PDFFont; bold: PDFFont }) {
    this.doc = doc;
    this.fonts = fonts;
    this.addPage();
  }

  addPage() {
    this.currentPage = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.currentPage);
    this.y = PAGE_H - MARGIN;
    this.currentPage.drawText(winAnsi("Blackglass · Sample data only · not for compliance submission"), {
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
    if (this.y - needed < MARGIN + 24) this.addPage();
  }

  text(
    text: string,
    opts: {
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
      x?: number;
      indent?: number;
    } = {},
  ) {
    const { size = 10, font, color = C_BLACK, x = MARGIN, indent = 0 } = opts;
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

export type DemoEvidencePdfInput = {
  tenantName: string;
  tenantSlug: string;
  generatedAt: string;
  hosts: DemoHost[];
  drift: DemoDriftFinding[];
  remediations: DemoRemediation[];
  audit: DemoAuditRow[];
};

export async function generateDemoEvidencePdf(input: DemoEvidencePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Blackglass — Sample integrity evidence");
  doc.setAuthor("Blackglass");
  doc.setCreator("Blackglass");
  doc.setCreationDate(new Date());

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pm = new PageManager(doc, { regular, bold });

  pm.currentPage.drawRectangle({
    x: 0,
    y: PAGE_H - 6,
    width: PAGE_W,
    height: 6,
    color: C_BRAND,
  });
  pm.y = PAGE_H - 56;

  pm.text("Blackglass", { size: 30, font: bold, color: C_BRAND });
  pm.currentPage.drawRectangle({
    x: MARGIN,
    y: pm.y - 5,
    width: 216,
    height: 3.5,
    color: C_BRAND,
  });
  pm.advance(LINE_LG + 8);
  pm.text("Integrity evidence", { size: 15, font: bold, color: C_BLACK });
  pm.advance(LINE_SM + 2);
  pm.text("Sample pack · fictional fleet data", { size: 11, font: regular, color: C_MUTED });
  pm.advance(LINE_MD + 8);
  hRule(pm.currentPage, pm.y);
  pm.advance(LINE_MD);

  pm.text("This document summarises fictional fleet data for evaluation only.", {
    size: 9,
    color: C_MUTED,
    font: regular,
  });
  pm.advance(LINE_SM + 2);

  const meta: [string, string][] = [
    ["Workspace", input.tenantName],
    ["Reference", input.tenantSlug],
    ["Prepared", fmtDate(input.generatedAt)],
    ["Hosts", String(input.hosts.length)],
    ["Findings", String(input.drift.length)],
    ["Remediation items", String(input.remediations.length)],
    ["Activity entries", String(input.audit.length)],
  ];
  for (const [label, value] of meta) {
    pm.text(label, { size: 9, font: bold, color: C_MUTED });
    pm.text(value, { size: 9, color: C_BLACK, x: MARGIN + 140 });
    pm.advance(LINE_SM);
  }

  pm.advance(LINE_MD);
  hRule(pm.currentPage, pm.y);
  pm.advance(LINE_MD * 1.5);

  // Hosts
  pm.ensureSpace(LINE_LG + LINE_SM);
  pm.text("Hosts in scope", { size: 14, font: bold, color: C_BLACK });
  pm.advance(LINE_LG);
  pm.text("NAME", { size: 8, font: bold, color: C_FAINT, x: MARGIN });
  pm.text("ENV", { size: 8, font: bold, color: C_FAINT, x: MARGIN + 160 });
  pm.text("REGION", { size: 8, font: bold, color: C_FAINT, x: MARGIN + 220 });
  pm.text("SSH POSTURE", { size: 8, font: bold, color: C_FAINT, x: MARGIN + 280 });
  pm.advance(LINE_SM - 2);
  hRule(pm.currentPage, pm.y);
  pm.advance(LINE_SM - 2);

  for (const h of input.hosts) {
    const posture = h.sshHardening === "pass" ? "Pass" : h.sshHardening === "warn" ? "Warning" : "Fail";
    pm.ensureSpace(LINE_SM + 4);
    pm.text(h.name.slice(0, 28), { size: 9, color: C_BLACK, x: MARGIN });
    pm.text(h.env, { size: 9, color: C_MUTED, x: MARGIN + 160 });
    pm.text(h.region.toUpperCase(), { size: 9, color: C_MUTED, x: MARGIN + 220 });
    pm.text(posture, { size: 9, font: bold, color: sevColor(h.sshHardening === "fail" ? "high" : "low"), x: MARGIN + 280 });
    pm.advance(LINE_SM + 2);
    hRule(pm.currentPage, pm.y);
    pm.advance(4);
  }

  pm.advance(LINE_MD);
  pm.ensureSpace(LINE_LG + LINE_SM);
  pm.text("Integrity findings", { size: 14, font: bold, color: C_BLACK });
  pm.advance(LINE_LG);

  for (const d of input.drift) {
    const lines = wrap(d.title, 78);
    const blockH = (lines.length + 1) * LINE_SM + 8;
    pm.ensureSpace(blockH);
    pm.text((d.severity[0]?.toUpperCase() ?? "") + d.severity.slice(1), {
      size: 8,
      font: bold,
      color: sevColor(d.severity),
    });
    pm.text(d.category, { size: 8, color: C_MUTED, x: MARGIN + 90 });
    pm.text(fmtDate(d.detectedAt).slice(0, 22), { size: 7, color: C_FAINT, x: MARGIN + 380 });
    pm.advance(LINE_SM);
    for (const line of lines) {
      pm.text(line, { size: 9, color: C_BLACK });
      pm.advance(LINE_SM);
    }
    pm.advance(4);
    hRule(pm.currentPage, pm.y);
    pm.advance(6);
  }

  pm.advance(LINE_MD);
  pm.ensureSpace(LINE_LG + LINE_SM);
  pm.text("Remediation queue", { size: 14, font: bold, color: C_BLACK });
  pm.advance(LINE_LG);

  for (const r of input.remediations) {
    const titleLines = wrap(r.title, 72);
    const status =
      r.status === "open" ? "Open" : r.status === "in_progress" ? "In progress" : "Verified";
    pm.ensureSpace(titleLines.length * LINE_SM + LINE_SM + 8);
    for (let i = 0; i < titleLines.length; i++) {
      pm.text(titleLines[i]!, { size: 9, color: C_BLACK });
      pm.advance(LINE_SM);
    }
    pm.text(`Owner: ${r.owner} · Due: ${r.due} · ${status}`, { size: 8, color: C_MUTED });
    pm.advance(LINE_SM + 6);
    hRule(pm.currentPage, pm.y);
    pm.advance(6);
  }

  pm.advance(LINE_MD);
  pm.ensureSpace(LINE_LG + LINE_SM);
  pm.text("Recent activity (sample)", { size: 14, font: bold, color: C_BLACK });
  pm.advance(LINE_LG);

  for (const a of input.audit) {
    const detailLines = wrap(`${a.action} — ${a.detail}`, 85);
    pm.ensureSpace(detailLines.length * LINE_SM + LINE_SM + 6);
    pm.text(fmtDate(a.at).slice(0, 20), { size: 8, color: C_FAINT });
    pm.text(a.actor, { size: 8, color: C_MUTED, x: MARGIN + 130 });
    pm.advance(LINE_SM);
    for (const line of detailLines) {
      pm.text(line, { size: 9, color: C_BLACK, x: MARGIN + 12 });
      pm.advance(LINE_SM);
    }
    pm.advance(6);
    hRule(pm.currentPage, pm.y);
    pm.advance(6);
  }

  pm.ensureSpace(LINE_MD * 2);
  pm.advance(LINE_SM);
  pm.text("A signed, workspace-specific evidence export is available to customers inside the Blackglass console.", {
    size: 8,
    color: C_MUTED,
  });
  pm.advance(LINE_SM);
  pm.text("https://blackglasssec.com", { size: 8, font: bold, color: C_BRAND });

  return doc.save();
}
