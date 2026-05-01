import type { ReportRecord } from "./types";

export const reports: ReportRecord[] = [
  {
    id: "rpt-100",
    title: "Fleet integrity — April 2026",
    scope: "Fleet · production",
    generatedAt: "2026-05-01T08:00:00Z",
    status: "ready",
    format: "markdown",
  },
  {
    id: "rpt-101",
    title: "PCI-scoped hosts — rolling 7d",
    scope: "Tag · pci-scope",
    generatedAt: "2026-04-30T18:22:00Z",
    status: "generating",
    format: "pdf",
  },
  {
    id: "rpt-102",
    title: "Customer ACME — exec summary",
    scope: "Workspace export",
    generatedAt: "2026-04-28T11:05:00Z",
    status: "failed",
    format: "pdf",
  },
];
