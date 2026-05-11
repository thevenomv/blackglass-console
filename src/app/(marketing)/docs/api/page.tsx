import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbSchema, canonical, defaultOgImages, defaultTwitterImages } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "API quick start · Blackglass docs",
  description:
    "Authenticate, push host snapshots, run scans, and read drift events — copy-pasteable curl + Node + Python examples for the Blackglass v1 API.",
  alternates: { canonical: canonical("/docs/api") },
  openGraph: {
    title: "API quick start · Blackglass docs",
    description:
      "Authenticate, push host snapshots, run scans, and read drift events with the Blackglass v1 API.",
    type: "article",
    siteName: "Blackglass",
    url: canonical("/docs/api"),
    images: defaultOgImages(),
  },
  twitter: {
    card: "summary_large_image",
    title: "API quick start · Blackglass docs",
    description:
      "Copy-pasteable curl + Node + Python examples for the Blackglass v1 API.",
    images: defaultTwitterImages(),
  },
};

export default function ApiDocsPage() {
  return (
    <main className="guide-article mx-auto max-w-3xl px-4 py-16 text-fg-muted">
      <JsonLd
        id="schema-breadcrumb"
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Docs", url: "/docs/api" },
          { name: "API quick start", url: "/docs/api" },
        ])}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-blue">Docs</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg-primary">
        API quick start
      </h1>
      <p className="mt-4 text-sm text-fg-faint">
        ~10 min read · v1 stable
      </p>

      <p className="mt-6 text-lg leading-relaxed">
        Every Blackglass surface — push-agent ingest, fleet scans, baseline capture,
        drift events, evidence bundles — is reachable through the same v1 REST API
        the console uses. This page covers the four flows you&rsquo;ll hit on day one.
      </p>

      <nav aria-label="Table of contents" className="mt-8 rounded-lg border border-border-default bg-bg-panel p-4 text-sm">
        <p className="font-semibold text-fg-primary">Contents</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-fg-muted">
          <li><a href="#auth" className="hover:text-accent-blue hover:underline">Authentication</a></li>
          <li><a href="#push" className="hover:text-accent-blue hover:underline">Push a host snapshot (agent ingest)</a></li>
          <li><a href="#baseline" className="hover:text-accent-blue hover:underline">Capture a baseline</a></li>
          <li><a href="#scan" className="hover:text-accent-blue hover:underline">Run a scan + poll for completion</a></li>
          <li><a href="#drift" className="hover:text-accent-blue hover:underline">Read drift events</a></li>
          <li><a href="#wake" className="hover:text-accent-blue hover:underline">Force-push a host (operator)</a></li>
          <li><a href="#errors" className="hover:text-accent-blue hover:underline">Error envelope &amp; rate limits</a></li>
          <li><a href="#openapi" className="hover:text-accent-blue hover:underline">Full OpenAPI spec</a></li>
        </ol>
      </nav>

      <section className="mt-14">
        <h2 id="auth" className="text-xl font-semibold text-fg-primary scroll-mt-20">
          1. Authentication
        </h2>
        <p className="mt-4 leading-relaxed">
          The API uses two credential models depending on which surface you&rsquo;re hitting:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed">
          <li>
            <strong className="text-fg-primary">Agent endpoints</strong>{" "}
            (<code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">/api/v1/ingest/*</code>,{" "}
            <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">/api/v1/agent/*</code>) accept a
            Bearer token from <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">INGEST_API_KEY</code>{" "}
            (shared) or <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">INGEST_HOST_KEYS_JSON</code>{" "}
            (per-host, preferred). Generate keys in <em>Settings &rarr; Ingest credentials</em>.
          </li>
          <li>
            <strong className="text-fg-primary">Operator endpoints</strong>{" "}
            (<code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">/api/v1/scans</code>,{" "}
            <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">/api/v1/baselines</code>,{" "}
            <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">/api/v1/hosts</code>) authenticate
            via Clerk session cookie (when called from the console) or a Personal Access Token
            from <em>Settings &rarr; API tokens</em> in the Bearer slot.
          </li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 id="push" className="text-xl font-semibold text-fg-primary scroll-mt-20">
          2. Push a host snapshot
        </h2>
        <p className="mt-4 leading-relaxed">
          The push-agent on each host POSTs the bundle output to{" "}
          <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">/api/v1/ingest/agent</code>.
          You almost never need to call this directly — the bundled agent script does it on a
          60-second timer. But if you&rsquo;re testing or building a custom collector, it looks like:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-card border border-border-default bg-bg-input/40 p-3 text-xs"><code>{`# curl
curl -X POST https://blackglasssec.com/api/v1/ingest/agent \\
  -H "Authorization: Bearer $BLACKGLASS_INGEST_KEY" \\
  -H "Content-Type: application/json" \\
  --data @- <<JSON
{
  "hostId":     "host-10-0-0-7",
  "hostname":   "web-prod-7.acme.io",
  "collectedAt": "2026-05-09T11:30:00Z",
  "bundle":     "=BGS:ss\\nLISTEN 0 128 :22\\n=BGS:passwd\\n..."
}
JSON`}</code></pre>
        <pre className="mt-3 overflow-x-auto rounded-card border border-border-default bg-bg-input/40 p-3 text-xs"><code>{`// node-fetch (Node 18+, native fetch)
await fetch("https://blackglasssec.com/api/v1/ingest/agent", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.BLACKGLASS_INGEST_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    hostId: "host-10-0-0-7",
    hostname: "web-prod-7.acme.io",
    collectedAt: new Date().toISOString(),
    bundle: bundleStringFromYourCollector(),
  }),
});`}</code></pre>
        <p className="mt-3 text-sm">
          On success you get <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">200 OK</code>{" "}
          with{" "}
          <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">{`{ "ok": true, "hostId": "host-..." }`}</code>.
          The push automatically computes drift against the host&rsquo;s baseline and stores any
          findings.
        </p>
      </section>

      <section className="mt-14">
        <h2 id="baseline" className="text-xl font-semibold text-fg-primary scroll-mt-20">
          3. Capture a baseline
        </h2>
        <p className="mt-4 leading-relaxed">
          Before drift detection means anything, each host needs a pinned baseline.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-card border border-border-default bg-bg-input/40 p-3 text-xs"><code>{`curl -X POST https://blackglasssec.com/api/v1/baselines \\
  -H "Authorization: Bearer $BLACKGLASS_PAT" \\
  -H "Content-Type: application/json" \\
  -d '{"hostIds":["host-10-0-0-7"]}'

# → 202 Accepted
# {"jobId":"baseline-…","status":"queued"}`}</code></pre>
        <p className="mt-3 text-sm">
          Poll <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">{`GET /api/v1/baselines/jobs/{jobId}`}</code>{" "}
          for completion (or skip the wait — once ingest sees a snapshot for a host with no
          baseline, it auto-bootstraps one).
        </p>
      </section>

      <section className="mt-14">
        <h2 id="scan" className="text-xl font-semibold text-fg-primary scroll-mt-20">
          4. Run a scan + poll for completion
        </h2>
        <pre className="mt-4 overflow-x-auto rounded-card border border-border-default bg-bg-input/40 p-3 text-xs"><code>{`# Kick off
SCAN=$(curl -sS -X POST https://blackglasssec.com/api/v1/scans \\
  -H "Authorization: Bearer $BLACKGLASS_PAT" \\
  -H "Content-Type: application/json" -d '{}' \\
  | jq -r .scanId)

# Poll every 3s until terminal
while true; do
  RESP=$(curl -sS https://blackglasssec.com/api/v1/scans/$SCAN \\
    -H "Authorization: Bearer $BLACKGLASS_PAT")
  STATUS=$(printf '%s' "$RESP" | jq -r .status)
  printf '[%s] %s\\n' "$STATUS" "$(printf '%s' "$RESP" | jq -r .detail)"
  if [ "$STATUS" = "succeeded" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 3
done`}</code></pre>
        <p className="mt-3 text-sm">
          The poll response includes{" "}
          <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">detail</code> — you&rsquo;ll see
          messages like <em>&ldquo;Waiting for fresh agent snapshot (47s remaining)&hellip;&rdquo;</em> when
          the SSH-fail fallback kicks in. See the{" "}
          <Link className="text-accent-blue hover:underline" href="/docs/snapshot-freshness">
            snapshot freshness model
          </Link>
          {" "}for what&rsquo;s happening under the hood.
        </p>
      </section>

      <section className="mt-14">
        <h2 id="drift" className="text-xl font-semibold text-fg-primary scroll-mt-20">
          5. Read drift events
        </h2>
        <pre className="mt-4 overflow-x-auto rounded-card border border-border-default bg-bg-input/40 p-3 text-xs"><code>{`# Latest events for one host
curl -sS \\
  "https://blackglasssec.com/api/v1/drift?hostId=host-10-0-0-7&limit=20" \\
  -H "Authorization: Bearer $BLACKGLASS_PAT" \\
  | jq '.events[] | {title,severity,detectedAt,category}'`}</code></pre>
        <pre className="mt-3 overflow-x-auto rounded-card border border-border-default bg-bg-input/40 p-3 text-xs"><code>{`# Python — same idea
import os, requests
r = requests.get(
  "https://blackglasssec.com/api/v1/drift",
  params={"hostId": "host-10-0-0-7", "limit": 20},
  headers={"Authorization": f"Bearer {os.environ['BLACKGLASS_PAT']}"},
  timeout=10,
)
r.raise_for_status()
for e in r.json()["events"]:
    print(e["severity"], e["title"])`}</code></pre>
      </section>

      <section className="mt-14">
        <h2 id="wake" className="text-xl font-semibold text-fg-primary scroll-mt-20">
          6. Force-push a host
        </h2>
        <p className="mt-4 leading-relaxed">
          When SSH to a host doesn&rsquo;t work and you don&rsquo;t want to wait up to 60s for the
          next agent push:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-card border border-border-default bg-bg-input/40 p-3 text-xs"><code>{`curl -X POST \\
  https://blackglasssec.com/api/v1/hosts/host-10-0-0-7/wake \\
  -H "Authorization: Bearer $BLACKGLASS_PAT"

# → 200 OK
# {"ok": true, "hostId": "host-10-0-0-7", "storage": "redis",
#  "message": "Wake flag set. The host's push-agent will publish its
#              next snapshot within ~10 seconds (provided the wake-check
#              timer is installed; see /docs/snapshot-freshness)."}`}</code></pre>
      </section>

      <section className="mt-14">
        <h2 id="errors" className="text-xl font-semibold text-fg-primary scroll-mt-20">
          7. Error envelope &amp; rate limits
        </h2>
        <p className="mt-4 leading-relaxed">
          Every error response is the same shape — easy to handle generically:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-card border border-border-default bg-bg-input/40 p-3 text-xs"><code>{`{
  "error":      "rate_limited",
  "detail":     "Too many checkout requests. Please wait before trying again.",
  "request_id": "req_01H…"
}`}</code></pre>
        <p className="mt-3 text-sm">
          The <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">request_id</code> field
          (also returned in the <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">x-request-id</code>{" "}
          response header) is the same string our server logs use — quote it when you ask
          support for help and we can pull the trace in seconds.
        </p>
        <p className="mt-3 text-sm">
          Rate limits are per-IP for unauthenticated routes and per-tenant for authenticated
          ones. A <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">429</code> means
          retry after a brief backoff; a <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">5xx</code>{" "}
          should trigger an exponential retry up to ~30s.
        </p>
      </section>

      <section className="mt-14">
        <h2 id="openapi" className="text-xl font-semibold text-fg-primary scroll-mt-20">
          8. Full OpenAPI spec
        </h2>
        <p className="mt-4 leading-relaxed">
          Every route, payload, and response code is described in the canonical OpenAPI 3.1
          document at{" "}
          <a className="text-accent-blue hover:underline" href="/openapi.yaml">
            <code className="rounded bg-bg-input px-1.5 py-0.5 text-[12px]">/openapi.yaml</code>
          </a>
          . Drop it into Postman, openapi-generator, or your IDE for typed clients in any
          language.
        </p>
      </section>

      <hr className="my-12 border-border-default" />

      <p className="text-sm text-fg-muted">
        Have a route you wish existed?{" "}
        <Link className="text-accent-blue hover:underline" href="/contact-sales">
          Tell us what you need
        </Link>
        {" "}— we ship API surface fast when there&rsquo;s a clear use case.
      </p>
    </main>
  );
}
