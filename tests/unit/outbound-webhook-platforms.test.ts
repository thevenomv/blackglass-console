/**
 * Unit tests for the outbound-webhook platform router.
 *
 * Covers detection by URL pattern + body/header shape per platform. The
 * delivery + queue plumbing is covered separately at the integration level;
 * these tests intentionally exercise only the pure formatter functions so
 * they run without Redis / DB / network.
 */

import { describe, expect, it } from "vitest";
import { __internals } from "@/lib/server/outbound-webhook";

const { detectPlatform, buildBodyAndHeaders } = __internals;

const SAMPLE_PAYLOAD = {
  event: "drift.detected" as const,
  scanId: "scan-aaa-bbb-ccc",
  hostId: "host-1",
  hostname: "web-01.example.com",
  timestamp: "2026-05-07T10:00:00.000Z",
  findings: [
    {
      id: "f-1",
      category: "privilege_escalation",
      severity: "high",
      title: "New SUID binary detected",
      rationale: "Binary /tmp/x has SUID bit set; not in baseline.",
    },
    {
      id: "f-2",
      category: "identity",
      severity: "medium",
      title: "User alice added",
      rationale: "Local user alice was not in baseline.",
    },
  ],
};

const EMPTY_CREDS = {
  servicenowAuth: null,
  jiraAuth: null,
  jiraProjectKey: null,
  datadogApiKey: null,
  linearApiKey: null,
  linearTeamId: null,
  githubToken: null,
  splunkHecToken: null,
  awsAccountId: null,
  awsRegion: null,
};

describe("outbound-webhook platform routing", () => {
  it("detectPlatform recognises every native adapter", () => {
    expect(detectPlatform("https://hooks.slack.com/services/T/B/X")).toBe("slack");
    expect(detectPlatform("https://events.pagerduty.com/v2/enqueue")).toBe("pagerduty");
    expect(detectPlatform("https://acme.service-now.com/api/now/table/incident")).toBe("servicenow");
    expect(detectPlatform("https://acme.atlassian.net/rest/api/3/issue")).toBe("jira");
    expect(detectPlatform("https://api.datadoghq.com/api/v1/events")).toBe("datadog");
    expect(detectPlatform("https://api.datadoghq.eu/api/v1/events")).toBe("datadog");
    expect(detectPlatform("https://api.linear.app/graphql")).toBe("linear");
    expect(detectPlatform("https://api.github.com/repos/acme/blackglass/issues")).toBe("github");
    expect(detectPlatform("https://splunk.acme.com:8088/services/collector/event")).toBe("splunk");
    expect(detectPlatform("https://splunk.acme.com:8088/services/collector")).toBe("splunk");
    expect(detectPlatform("https://relay.example.com/asff")).toBe("asff");
    expect(detectPlatform("https://lambda.aws/security-hub/import")).toBe("asff");
    expect(detectPlatform("https://workspace.ods.opinsights.azure.com/...")).toBe("sentinel");
    expect(detectPlatform("https://relay.example.com/cef")).toBe("sentinel");
    expect(detectPlatform("https://example.com/hook")).toBe("generic");
  });

  it("ServiceNow body includes the right urgency + correlation_id", () => {
    const { body, headers } = buildBodyAndHeaders(
      "https://acme.service-now.com/api/now/table/incident",
      SAMPLE_PAYLOAD,
      null,
      { ...EMPTY_CREDS, servicenowAuth: "operator:secret123" },
    );
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed.urgency).toBe("1"); // high severity in payload → 1
    expect(parsed.correlation_id).toBe(`blackglass-${SAMPLE_PAYLOAD.scanId}-${SAMPLE_PAYLOAD.hostId}`);
    expect(headers["Authorization"]).toMatch(/^Basic /);
    // Decoded basic auth is the configured user:pass
    const decoded = Buffer.from(headers["Authorization"].replace(/^Basic /, ""), "base64").toString("utf8");
    expect(decoded).toBe("operator:secret123");
  });

  it("Jira body uses ADF + maps high severity to Highest priority", () => {
    const { body } = buildBodyAndHeaders(
      "https://acme.atlassian.net/rest/api/3/issue",
      SAMPLE_PAYLOAD,
      null,
      { ...EMPTY_CREDS, jiraAuth: "ops@x.com:tok", jiraProjectKey: "SEC" },
    );
    const parsed = JSON.parse(body) as { fields: { project: { key: string }; priority: { name: string }; description: { type: string } } };
    expect(parsed.fields.project.key).toBe("SEC");
    expect(parsed.fields.priority.name).toBe("Highest");
    expect(parsed.fields.description.type).toBe("doc");
  });

  it("Datadog body sets DD-API-KEY header + alert_type=error for high severity", () => {
    const { body, headers } = buildBodyAndHeaders(
      "https://api.datadoghq.com/api/v1/events",
      SAMPLE_PAYLOAD,
      null,
      { ...EMPTY_CREDS, datadogApiKey: "dd-key-123" },
    );
    expect(headers["DD-API-KEY"]).toBe("dd-key-123");
    const parsed = JSON.parse(body) as { alert_type: string; tags: string[] };
    expect(parsed.alert_type).toBe("error");
    expect(parsed.tags).toContain(`scan_id:${SAMPLE_PAYLOAD.scanId}`);
  });

  it("Linear body wraps a GraphQL mutation with the team id + urgent priority", () => {
    const { body, headers } = buildBodyAndHeaders(
      "https://api.linear.app/graphql",
      SAMPLE_PAYLOAD,
      null,
      { ...EMPTY_CREDS, linearApiKey: "lin_xxx", linearTeamId: "team-uuid-1" },
    );
    expect(headers["Authorization"]).toBe("lin_xxx"); // No "Bearer " prefix per Linear docs
    const parsed = JSON.parse(body) as { query: string; variables: { input: { teamId: string; priority: number } } };
    expect(parsed.query).toContain("issueCreate");
    expect(parsed.variables.input.teamId).toBe("team-uuid-1");
    expect(parsed.variables.input.priority).toBe(1); // high → 1 (urgent)
  });

  it("GitHub body sets Bearer token + version header + severity label", () => {
    const { body, headers } = buildBodyAndHeaders(
      "https://api.github.com/repos/acme/blackglass/issues",
      SAMPLE_PAYLOAD,
      null,
      { ...EMPTY_CREDS, githubToken: "ghp_xxx" },
    );
    expect(headers["Authorization"]).toBe("Bearer ghp_xxx");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    const parsed = JSON.parse(body) as { labels: string[]; title: string };
    expect(parsed.labels).toEqual(expect.arrayContaining(["blackglass", "severity:high"]));
    expect(parsed.title).toContain("web-01.example.com");
  });

  it("falls back to generic JSON + HMAC signature when URL is unknown", () => {
    const { body, headers } = buildBodyAndHeaders(
      "https://example.com/hook",
      SAMPLE_PAYLOAD,
      null,
      EMPTY_CREDS,
      { current: "shhh", previous: null },
    );
    expect(headers["X-Blackglass-Signature"]).toMatch(/^sha256=[0-9a-f]+$/);
    const parsed = JSON.parse(body) as { event: string };
    expect(parsed.event).toBe("drift.detected");
  });

  it("Splunk HEC body wraps event envelope + sends Authorization: Splunk header", () => {
    const { body, headers } = buildBodyAndHeaders(
      "https://splunk.acme.com:8088/services/collector/event",
      SAMPLE_PAYLOAD,
      null,
      { ...EMPTY_CREDS, splunkHecToken: "hec-tok-123" },
    );
    expect(headers["Authorization"]).toBe("Splunk hec-tok-123");
    const parsed = JSON.parse(body) as {
      time: number;
      host: string;
      sourcetype: string;
      event: { event: string; severity: string };
    };
    expect(parsed.host).toBe("web-01.example.com");
    expect(parsed.sourcetype).toBe("blackglass:drift");
    expect(parsed.time).toBe(Math.floor(new Date(SAMPLE_PAYLOAD.timestamp).getTime() / 1000));
    expect(parsed.event.event).toBe("drift.detected");
    expect(parsed.event.severity).toBe("high");
  });

  it("AWS Security Hub body produces ASFF Findings with stable Id + signed body", () => {
    const { body, headers } = buildBodyAndHeaders(
      "https://relay.example.com/asff",
      SAMPLE_PAYLOAD,
      null,
      { ...EMPTY_CREDS, awsAccountId: "123456789012", awsRegion: "eu-west-1" },
      { current: "shhh", previous: null },
    );
    expect(headers["X-Blackglass-Signature"]).toMatch(/^sha256=[0-9a-f]+$/);
    const parsed = JSON.parse(body) as {
      Findings: Array<{
        Id: string;
        ProductArn: string;
        AwsAccountId: string;
        Severity: { Label: string; Normalized: number };
        Resources: Array<{ Region: string }>;
      }>;
    };
    expect(parsed.Findings).toHaveLength(2);
    const high = parsed.Findings[0];
    expect(high.Id).toBe(`blackglass/${SAMPLE_PAYLOAD.scanId}/${SAMPLE_PAYLOAD.hostId}/f-1`);
    expect(high.AwsAccountId).toBe("123456789012");
    expect(high.ProductArn).toContain("eu-west-1");
    expect(high.Severity.Label).toBe("HIGH");
    expect(high.Severity.Normalized).toBe(70);
    expect(high.Resources[0].Region).toBe("eu-west-1");
  });

  it("ASFF body falls back to default account / region when env not set", () => {
    const { body } = buildBodyAndHeaders(
      "https://relay.example.com/asff",
      SAMPLE_PAYLOAD,
      null,
      EMPTY_CREDS,
    );
    const parsed = JSON.parse(body) as {
      Findings: Array<{ AwsAccountId: string; Resources: Array<{ Region: string }> }>;
    };
    expect(parsed.Findings[0].AwsAccountId).toBe("000000000000");
    expect(parsed.Findings[0].Resources[0].Region).toBe("us-east-1");
  });

  it("Sentinel CEF body emits one CEF line per finding with text/plain content type", () => {
    const { body, headers } = buildBodyAndHeaders(
      "https://relay.example.com/cef",
      SAMPLE_PAYLOAD,
      null,
      EMPTY_CREDS,
    );
    expect(headers["Content-Type"]).toBe("text/plain");
    const lines = body.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^CEF:0\|BLACKGLASS\|BLACKGLASS\|1\.0\|/);
    expect(lines[0]).toContain("BLACKGLASS-PRIVILEGE_ESCALATION");
    expect(lines[0]).toContain("|9|"); // high severity → 9
    expect(lines[0]).toContain("dvchost=web-01.example.com");
    expect(lines[1]).toContain("|6|"); // medium severity → 6
  });

  it("CEF escapes pipes and equals in extension values", () => {
    const tricky = {
      ...SAMPLE_PAYLOAD,
      findings: [
        {
          id: "f-x",
          category: "test",
          severity: "medium",
          title: "Pipe | in title",
          rationale: "key=val and another | here",
        },
      ],
    };
    const { body } = buildBodyAndHeaders(
      "https://relay.example.com/cef",
      tricky,
      null,
      EMPTY_CREDS,
    );
    // Header field separators are pipes — the title pipe must be escaped (\|)
    expect(body).toContain("Pipe \\| in title");
    // Extension values escape `=` to avoid breaking the k=v parser; pipes
    // are allowed inside extensions (they only need escaping in the header).
    expect(body).toContain("msg=key\\=val and another | here");
  });

  it("OCSF body emits one Compliance Finding per drift event with required class metadata", () => {
    const { body, headers } = buildBodyAndHeaders(
      "https://ingest.example.com/ocsf",
      { ...SAMPLE_PAYLOAD, tenantId: "tenant-123" },
      null,
      EMPTY_CREDS,
    );
    expect(headers["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(body) as {
      events: Array<{
        class_uid: number;
        category_uid: number;
        type_uid: number;
        activity_id: number;
        severity_id: number;
        severity: string;
        metadata: { version: string; product: { name: string } };
        finding_info: { uid: string; title: string };
        device: { hostname: string };
        unmapped: Record<string, unknown>;
      }>;
    };
    expect(parsed.events).toHaveLength(2);
    const high = parsed.events[0];
    // OCSF Compliance Finding shape — class_uid 2003, category_uid 2,
    // type_uid 200301 (= class*100 + activity_id). These are part of the
    // OCSF contract; getting any of them wrong drops the event into a
    // Security Lake "rejected" partition rather than the queryable table.
    expect(high.class_uid).toBe(2003);
    expect(high.category_uid).toBe(2);
    expect(high.type_uid).toBe(200301);
    expect(high.activity_id).toBe(1);
    // High → severity_id 4 / "High" (OCSF scale: 0-6).
    expect(high.severity_id).toBe(4);
    expect(high.severity).toBe("High");
    expect(high.metadata.version).toBe("2.0.0");
    expect(high.metadata.product.name).toBe("BLACKGLASS");
    expect(high.finding_info.uid).toBe("f-1");
    expect(high.finding_info.title).toBe("New SUID binary detected");
    expect(high.device.hostname).toBe("web-01.example.com");
    // Tenant context is promoted to unmapped so customers can filter the
    // data lake without a JOIN.
    expect(high.unmapped.blackglass_tenant_id).toBe("tenant-123");
    expect(high.unmapped.blackglass_category).toBe("privilege_escalation");
  });

  it("OCSF detects /ocsf, /security-lake, and /ocsf-ingest URL suffixes", () => {
    expect(detectPlatform("https://ingest.example.com/ocsf")).toBe("ocsf");
    expect(detectPlatform("https://acme.com/security-lake/firehose")).toBe("ocsf");
    expect(detectPlatform("https://example.com/ocsf-ingest/v1")).toBe("ocsf");
    // Generic webhook URLs without an OCSF marker stay generic — opt-in only.
    expect(detectPlatform("https://example.com/webhook")).toBe("generic");
  });

  it("missing credentials still produce a body — server-side errors surface clearly downstream", () => {
    // No Authorization header is set so the upstream API will respond 401/403,
    // which the worker logs and the operator sees in the DLQ. Better than
    // failing silently before dispatch.
    const { headers } = buildBodyAndHeaders(
      "https://api.github.com/repos/acme/blackglass/issues",
      SAMPLE_PAYLOAD,
      null,
      EMPTY_CREDS,
    );
    expect(headers["Authorization"]).toBeUndefined();
  });
});
