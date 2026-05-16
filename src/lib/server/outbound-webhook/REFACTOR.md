# `outbound-webhook/` — carve-up complete

The 2026-05-16 layout refactor split the original 1100-line `index.ts` into
one file per concern.  `index.ts` is now public API only.

## Final layout

```
outbound-webhook/
  index.ts                 // ✅ public API + dispatchDriftWebhook /
                           //    dispatchTenantJsonWebhooks / sendTestWebhook /
                           //    __internals (tests)
  types.ts                 // ✅ WebhookPayload, SeverityLevel, Platform,
                           //    IntegrationCreds, SigningKeys, SEVERITY_RANK,
                           //    MAX_PAYLOAD_FINDINGS, APP_URL
  signing.ts               // ✅ sign(), applySignatureHeaders()
  config.ts                // ✅ webhookUrls(), applyAirgapFilter(), minSeverity()
  dispatch.ts              // ✅ buildBodyAndHeaders, dispatchOne,
                           //    deliverWebhookInline
  platforms/
    index.ts               // ✅ re-export hub
    detect.ts              // ✅ detectPlatform()
    format.ts              // ✅ highestSeverity, summaryLine,
                           //    findingsMarkdown, findingsPlainText, severityEmoji
    servicenow.ts          // ✅ buildServiceNowPayload
    jira.ts                // ✅ buildJiraPayload
    datadog.ts             // ✅ buildDatadogPayload
    linear.ts              // ✅ buildLinearPayload
    github.ts              // ✅ buildGithubPayload
    splunk.ts              // ✅ buildSplunkPayload
    asff.ts                // ✅ buildAsffPayload
    sentinel.ts            // ✅ buildSentinelCefPayload (+ CEF escape helpers)
    ocsf.ts                // ✅ buildOcsfPayload (+ ocsfSeverityId)
    slack.ts               // ✅ buildSlackPayload
    pagerduty.ts           // ✅ buildPagerDutyPayload
```

## Public API (must remain exported from `index.ts`)

- `deliverWebhookInline(...)`
- `dispatchDriftWebhook(...)`
- `dispatchTenantJsonWebhooks(...)`
- `sendTestWebhook(...)`
- `webhookUrls` (re-exported from `./config`)
- `__internals` (used only by `tests/unit/webhooks/outbound-webhook-platforms.test.ts`)

## Tests

`tests/unit/webhooks/outbound-webhook-platforms.test.ts` consumes `__internals`
— preserve that named export when adding new platform builders.

## Adding a new platform

1. Create `platforms/<vendor>.ts` exporting `buildVendorPayload(payload, ...): { body, extraHeaders }`.
2. Add a regex test in `platforms/detect.ts` and a new tag in the `Platform`
   union in `types.ts`.
3. Wire it into the `if/else` chain inside `dispatch.ts > buildBodyAndHeaders`.
4. Re-export from `platforms/index.ts`.
5. Add an `__internals.buildVendorPayload` entry in `index.ts` if you need
   test coverage from `outbound-webhook-platforms.test.ts`.
