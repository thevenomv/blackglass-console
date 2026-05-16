/**
 * AWS Security Hub — ASFF (AWS Security Finding Format)
 * Customers route through a Lambda Function URL / API Gateway that calls
 * BatchImportFindings server-side (since SigV4 is impractical here). We
 * produce ASFF-shaped findings — one per drift event — wrapped in a list.
 * Reference: https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html
 */

import { APP_URL, type WebhookPayload } from "../types";

export function buildAsffPayload(
  payload: WebhookPayload,
  awsAccountId: string | null,
  awsRegion: string | null,
): { body: string; extraHeaders: Record<string, string> } {
  const region = awsRegion ?? "us-east-1";
  const account = awsAccountId ?? "000000000000";
  // ASFF severity normalized 0–100 — map our 3 levels into Security Hub buckets.
  const sevMap: Record<string, { Label: string; Normalized: number }> = {
    high: { Label: "HIGH", Normalized: 70 },
    medium: { Label: "MEDIUM", Normalized: 40 },
    low: { Label: "LOW", Normalized: 10 },
  };
  const findings = payload.findings.map((f) => {
    const sev = sevMap[f.severity] ?? sevMap.low;
    return {
      SchemaVersion: "2018-10-08",
      // Stable Id — same finding rehydrates the same Security Hub record.
      Id: `blackglass/${payload.scanId}/${payload.hostId}/${f.id}`,
      ProductArn: `arn:aws:securityhub:${region}:${account}:product/${account}/default`,
      GeneratorId: `blackglass-${f.category}`,
      AwsAccountId: account,
      Types: [`Software and Configuration Checks/Industry and Regulatory Standards/${f.category}`],
      CreatedAt: payload.timestamp,
      UpdatedAt: payload.timestamp,
      Severity: sev,
      Title: f.title,
      Description: f.rationale,
      Resources: [
        {
          Type: "Other",
          Id: `blackglass:host:${payload.hostId}`,
          Partition: "aws",
          Region: region,
          Details: { Other: { hostname: payload.hostname, scanId: payload.scanId } },
        },
      ],
      SourceUrl: `${APP_URL}/drift?host=${encodeURIComponent(payload.hostId)}`,
      RecordState: "ACTIVE",
      Workflow: { Status: "NEW" },
      ProductFields: { "blackglass/category": f.category, "blackglass/scanId": payload.scanId },
    };
  });
  return {
    body: JSON.stringify({ Findings: findings }),
    extraHeaders: { Accept: "application/json" },
  };
}
