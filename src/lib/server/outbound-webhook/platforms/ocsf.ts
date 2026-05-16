/**
 * OCSF — Open Cybersecurity Schema Framework (Compliance Finding, class 2003)
 *
 * OCSF is the 2026 industry-standard schema for normalised security
 * telemetry. Targets that ingest OCSF directly:
 *   - Amazon Security Lake
 *   - Splunk Cloud (OCSF add-on)
 *   - Snowflake security data lake
 *   - OpenSearch Security Analytics
 *   - Sumo Logic Cloud SIEM
 *
 * Each drift finding becomes one OCSF event. We emit them as an
 * array (`{ "events": [...] }`) so a single POST can carry a batch
 * with at-least-once delivery semantics from the customer-side
 * ingester. Activity is fixed to `Create` (1) — we don't send
 * updates for the same finding from this dispatcher.
 *
 * Schema reference:
 *   https://schema.ocsf.io/2.0.0/classes/compliance_finding
 *
 * Class / category enums chosen here:
 *   class_uid  = 2003   (Compliance Finding)
 *   category_uid = 2     (Findings)
 *   activity_id = 1      (Create)
 *   type_uid   = 200301  (Compliance Finding: Create)
 */

import { APP_URL, type WebhookPayload } from "../types";

function ocsfSeverityId(severity: string): { id: number; label: string } {
  // OCSF severity_id: 0 unknown · 1 informational · 2 low · 3 medium · 4 high · 5 critical · 6 fatal
  if (severity === "high") return { id: 4, label: "High" };
  if (severity === "medium") return { id: 3, label: "Medium" };
  if (severity === "low") return { id: 2, label: "Low" };
  return { id: 0, label: "Unknown" };
}

export function buildOcsfPayload(
  payload: WebhookPayload,
): { body: string; extraHeaders: Record<string, string> } {
  const epochMs = new Date(payload.timestamp).getTime();
  const events = payload.findings.map((f) => {
    const sev = ocsfSeverityId(f.severity);
    return {
      // OCSF metadata block — required on every event.
      metadata: {
        version: "2.0.0",
        product: {
          name: "Blackglass",
          vendor_name: "Obsidian Dynamics",
          version: "1.0",
          uid: "blackglass-console",
        },
        log_name: "blackglass.drift",
        // Stable per-finding correlation key — same finding rehydrates the
        // same record in the customer's data lake.
        uid: `blackglass/${payload.scanId}/${payload.hostId}/${f.id}`,
      },
      // Activity, category and type identifiers are part of the OCSF
      // contract — see schema reference above.
      activity_id: 1,
      activity_name: "Create",
      category_uid: 2,
      category_name: "Findings",
      class_uid: 2003,
      class_name: "Compliance Finding",
      type_uid: 200301,
      type_name: "Compliance Finding: Create",
      severity_id: sev.id,
      severity: sev.label,
      // Required on every event.
      time: epochMs,
      // Free-form text fields — keep concise so search facets stay clean.
      message: f.title,
      // The finding itself.
      finding_info: {
        uid: f.id,
        title: f.title,
        desc: f.rationale,
        types: [f.category],
        // Customer review surface — the OCSF reference field for human
        // follow-up.
        src_url: `${APP_URL}/drift?host=${encodeURIComponent(payload.hostId)}`,
      },
      // The host the finding pertains to. Mapped to OCSF's `device`.
      device: {
        type: "Server",
        type_id: 1,
        hostname: payload.hostname,
        uid: payload.hostId,
        os: { name: "Linux", type: "Linux", type_id: 200 },
      },
      // Tenant context — promoted to top-level `unmapped` because OCSF
      // 2.0.0 doesn't have a first-class tenant slot. Customers querying
      // the data lake can filter on this field.
      unmapped: {
        ...(payload.tenantId ? { blackglass_tenant_id: payload.tenantId } : {}),
        blackglass_scan_id: payload.scanId,
        blackglass_category: f.category,
      },
    };
  });

  return {
    body: JSON.stringify({ events }),
    extraHeaders: { Accept: "application/json" },
  };
}
