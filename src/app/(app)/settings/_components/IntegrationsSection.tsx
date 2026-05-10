/**
 * Integrations status panel.
 *
 * Lists every native integration adapter the outbound-webhook dispatcher
 * supports and shows whether the credentials are configured. Pulls from
 * `getTenantNotifications(undefined)` so it reflects the same env-var fallback
 * the worker uses; per-tenant DB columns are a follow-on but the type already
 * includes them so this UI doesn't need to change when they land.
 *
 * Server component on purpose — credentials never leave the server, only the
 * boolean "configured" flag is rendered.
 */

import { getTenantNotifications } from "@/lib/server/services/notifications-service";

interface IntegrationDef {
  id: string;
  name: string;
  /** What the dispatcher will do once a matching webhook URL is configured. */
  description: string;
  /** Pattern of webhook URL that activates this adapter. */
  urlPattern: string;
  /** Env vars the operator needs to set for credentials. */
  envVars: string[];
  /** Setup link / docs target (omit when no external doc URL is used). */
  docs?: string;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Block Kit message in the target channel via incoming webhook.",
    urlPattern: "hooks.slack.com/services/...",
    envVars: ["SLACK_ALERT_WEBHOOK_URL"],
    docs: "https://api.slack.com/messaging/webhooks",
  },
  {
    id: "pagerduty",
    name: "PagerDuty",
    description: "Triggers an Events v2 incident; severity maps from finding mix.",
    urlPattern: "events.pagerduty.com/v2/enqueue",
    envVars: ["PD_ROUTING_KEY"],
    docs: "https://developer.pagerduty.com/docs/events-api-v2",
  },
  {
    id: "servicenow",
    name: "ServiceNow",
    description: "POSTs an Incident record (correlation_id-deduped per scan).",
    urlPattern: "<instance>.service-now.com/api/now/table/incident",
    envVars: ["SERVICENOW_AUTH (user:password)"],
    docs: "https://developer.servicenow.com/dev.do",
  },
  {
    id: "jira",
    name: "Jira",
    description: "Creates a Task issue with severity-mapped priority + ADF body.",
    urlPattern: "<workspace>.atlassian.net/rest/api/3/issue",
    envVars: ["JIRA_AUTH (email:api-token)", "JIRA_PROJECT_KEY"],
    docs: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/",
  },
  {
    id: "datadog",
    name: "Datadog",
    description: "Posts an Event with severity-mapped alert_type and tags.",
    urlPattern: "api.datadoghq.com/api/v1/events (or .eu)",
    envVars: ["DD_API_KEY"],
    docs: "https://docs.datadoghq.com/api/latest/events/#post-an-event",
  },
  {
    id: "linear",
    name: "Linear",
    description: "GraphQL issueCreate mutation with priority + markdown body.",
    urlPattern: "api.linear.app/graphql",
    envVars: ["LINEAR_API_KEY", "LINEAR_TEAM_ID"],
    docs: "https://developers.linear.app/docs/graphql/working-with-the-graphql-api",
  },
  {
    id: "github",
    name: "GitHub Issues",
    description: "Creates an issue in the target repo with severity labels.",
    urlPattern: "api.github.com/repos/<owner>/<repo>/issues",
    envVars: ["GITHUB_TOKEN"],
  },
  {
    id: "splunk",
    name: "Splunk HEC",
    description: "Sends a single HEC event per host scan with the full finding set.",
    urlPattern: "<splunk-host>:8088/services/collector/event",
    envVars: ["SPLUNK_HEC_TOKEN", "SPLUNK_HEC_INDEX (optional, defaults to 'main')"],
    docs: "https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector",
  },
  {
    id: "asff",
    name: "AWS Security Hub (ASFF)",
    description:
      "Sends ASFF-formatted findings to a customer-managed relay (Lambda Function URL / API Gateway) which calls BatchImportFindings under SigV4. Body is signed with WEBHOOK_SECRET so the relay can verify provenance.",
    urlPattern: "<your-relay>/asff (or any URL containing 'security-hub')",
    envVars: ["AWS_ACCOUNT_ID", "AWS_REGION", "WEBHOOK_SECRET (signs the body)"],
    docs: "https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html",
  },
  {
    id: "sentinel",
    name: "Microsoft Sentinel (CEF)",
    description:
      "Emits CEF-formatted text (one line per finding) for ingestion via a Sentinel CEF connector or relay. Body is signed with WEBHOOK_SECRET when set.",
    urlPattern: "<workspace>.ods.opinsights.azure.com/... or <relay>/cef",
    envVars: ["WEBHOOK_SECRET (signs the body)"],
    docs: "https://learn.microsoft.com/en-us/azure/sentinel/connect-cef-syslog",
  },
];

export async function IntegrationsSection() {
  const routing = await getTenantNotifications(undefined);

  // Compute "configured" per platform from the routing struct + the configured
  // webhook URLs. A platform is *configured* when (a) credentials exist and
  // (b) at least one webhook URL matches its pattern.
  const urls = routing.webhookUrls;
  const matchesPattern = (id: string): boolean => {
    if (id === "slack") return !!routing.slackWebhookUrl;
    if (id === "pagerduty") return urls.some((u) => /events\.pagerduty\.com|pagerduty\.com\/v2/i.test(u));
    if (id === "servicenow") return urls.some((u) => /service-now\.com\/api\/now/i.test(u));
    if (id === "jira") return urls.some((u) => /atlassian\.net\/rest\/api/i.test(u));
    if (id === "datadog") return urls.some((u) => /datadoghq\.(?:com|eu)\/api\//i.test(u));
    if (id === "linear") return urls.some((u) => /api\.linear\.app\/graphql/i.test(u));
    if (id === "github") return urls.some((u) => /api\.github\.com\/repos\//i.test(u));
    if (id === "splunk") return urls.some((u) => /\/services\/collector(?:\/event)?(?:$|[?\/])/i.test(u));
    if (id === "asff") return urls.some((u) => /(?:\/asff(?:$|[?\/])|security-hub)/i.test(u));
    if (id === "sentinel") {
      return urls.some((u) =>
        /(?:ods\.opinsights\.azure\.com|ingest\.monitor\.azure\.com|\/cef(?:$|[?\/]))/i.test(u),
      );
    }
    return false;
  };
  const credsPresent = (id: string): boolean => {
    if (id === "slack") return !!routing.slackWebhookUrl;
    if (id === "pagerduty") return !!routing.pdRoutingKey;
    if (id === "servicenow") return !!routing.servicenowAuth;
    if (id === "jira") return !!routing.jiraAuth && !!routing.jiraProjectKey;
    if (id === "datadog") return !!routing.datadogApiKey;
    if (id === "linear") return !!routing.linearApiKey && !!routing.linearTeamId;
    if (id === "github") return !!routing.githubToken;
    if (id === "splunk") return !!routing.splunkHecToken;
    // ASFF + Sentinel are infrastructure integrations — they "have creds" if the
    // signing secret is configured, since both rely on body-signature verification
    // at the relay.
    if (id === "asff") return !!process.env.WEBHOOK_SECRET?.trim();
    if (id === "sentinel") return !!process.env.WEBHOOK_SECRET?.trim();
    return false;
  };

  return (
    <section className="space-y-3 rounded-card border border-border-default bg-bg-panel p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg-primary">Outbound integrations</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Native adapters for the most common SIEM / ticketing / chat tools.
          Add a matching webhook URL to <span className="font-mono">WEBHOOK_URLS</span>{" "}
          (or the Slack / PagerDuty slots above) and set the credential env
          vars; the dispatcher auto-routes by URL pattern.
        </p>
      </div>

      <ul className="divide-y divide-border-subtle rounded-card border border-border-default">
        {INTEGRATIONS.map((integ) => {
          const urlOk = matchesPattern(integ.id);
          const credsOk = credsPresent(integ.id);
          const ready = urlOk && credsOk;
          const partial = urlOk !== credsOk;

          return (
            <li key={integ.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-fg-primary">{integ.name}</p>
                  {ready ? (
                    <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success">
                      Ready
                    </span>
                  ) : partial ? (
                    <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning">
                      {urlOk ? "Needs creds" : "Needs URL"}
                    </span>
                  ) : (
                    <span className="rounded-md border border-border-default px-1.5 py-0.5 text-[10px] font-semibold uppercase text-fg-faint">
                      Not configured
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-fg-muted">{integ.description}</p>
                <p className="mt-1 font-mono text-[11px] text-fg-faint">URL: {integ.urlPattern}</p>
                <p className="font-mono text-[11px] text-fg-faint">
                  Env: {integ.envVars.join(", ")}
                </p>
              </div>
              {integ.docs ? (
                <a
                  href={integ.docs}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 self-start rounded-md border border-border-default bg-bg-elevated px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-accent-blue hover:text-accent-blue"
                >
                  Docs ↗
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-fg-faint">
        Per-tenant credential storage is on the roadmap (P3). Today every
        integration uses the env-var values shown above; in multi-tenant
        deployments they apply to all workspaces.
      </p>
    </section>
  );
}
