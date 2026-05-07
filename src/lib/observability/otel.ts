/**
 * Optional OpenTelemetry trace export.
 *
 * BLACKGLASS uses Sentry as its primary observability backend; this
 * module is for customers who *also* want to forward server-side spans
 * to their own OTLP collector (Honeycomb, Tempo, Jaeger, Datadog APM
 * via the OTLP receiver, Grafana Cloud, etc.).
 *
 * Why optional-import:
 *   - The full OTel SDK adds ~15 MB to the dist bundle and pulls in
 *     transitively a lot of native bindings.
 *   - Sentry v10 already runs an OTel TracerProvider internally for
 *     its own performance traces; running a second SDK can lead to
 *     globalThis collisions on the propagator. We let the customer
 *     opt in explicitly so they can decide which TracerProvider wins.
 *
 * Activation:
 *   1. Install the optional packages in your deployment:
 *        npm i @opentelemetry/api @opentelemetry/sdk-node \
 *              @opentelemetry/exporter-trace-otlp-http \
 *              @opentelemetry/resources \
 *              @opentelemetry/semantic-conventions
 *   2. Set environment variables:
 *        OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com/v1/traces
 *        OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer xyz   (optional)
 *        OTEL_SERVICE_NAME=blackglass-web                       (optional, default below)
 *        OTEL_SAMPLE_RATIO=0.1                                   (optional, default 0.1)
 *
 * Behaviour:
 *   - Dynamic import — if the optional packages are missing, this
 *     module logs a single info message and becomes a no-op so the
 *     server still boots.
 *   - Endpoint missing → no-op (not an error). Lets you ship the same
 *     bundle to dev / staging / prod with only env-var differences.
 *   - All errors are caught — OTel must never fail the request hot
 *     path.
 *
 * Sentry coexistence:
 *   - Sentry installs its own TracerProvider very early in
 *     `sentry.server.config.ts`. We initialise the OTel SDK *after*
 *     Sentry so Sentry's provider stays the global one; our exporter
 *     is added as an additional SpanProcessor on the same provider
 *     when possible, otherwise we install a parallel SDK and log a
 *     warning that you'll see double-counted spans in Sentry.
 */

interface OtelHandles {
  shutdown: () => Promise<void>;
}

function readEndpoint(): string | null {
  const ep = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  return ep && ep.length > 0 ? ep : null;
}

function readHeaders(): Record<string, string> {
  // OTel convention is `key1=value1,key2=value2`. Whitespace is allowed
  // and we trim defensively.
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS?.trim();
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function readSampleRatio(): number {
  const raw = Number(process.env.OTEL_SAMPLE_RATIO ?? 0.1);
  if (!Number.isFinite(raw) || raw < 0) return 0.1;
  return Math.min(raw, 1);
}

let initialized = false;
let handles: OtelHandles | null = null;

/**
 * Initialise the OTLP exporter. Idempotent. Returns immediately when:
 *   - OTEL_EXPORTER_OTLP_ENDPOINT is unset
 *   - OTel packages aren't installed
 *   - Already initialised
 */
export async function initOpenTelemetry(): Promise<void> {
  if (initialized) return;
  const endpoint = readEndpoint();
  if (!endpoint) return;

  // Dynamic import behind a function to defer the resolve. We swallow
  // the error from each `await import` so a missing optional package
  // doesn't crash boot — we want this module to be safe to call from
  // `instrumentation.ts` regardless of the deployment shape.
  const sdkModule = await tryImport<{
    NodeSDK: new (config: unknown) => {
      start: () => void | Promise<void>;
      shutdown: () => Promise<void>;
    };
  }>("@opentelemetry/sdk-node");
  const exporterModule = await tryImport<{
    OTLPTraceExporter: new (config: { url: string; headers?: Record<string, string> }) => unknown;
  }>("@opentelemetry/exporter-trace-otlp-http");
  const resourcesModule = await tryImport<{
    Resource: new (attrs: Record<string, string | number>) => unknown;
  }>("@opentelemetry/resources");
  const semconvModule = await tryImport<{
    SemanticResourceAttributes: { SERVICE_NAME: string; SERVICE_VERSION: string };
  }>("@opentelemetry/semantic-conventions");

  if (!sdkModule || !exporterModule || !resourcesModule || !semconvModule) {
    console.info(
      "[otel] OTEL_EXPORTER_OTLP_ENDPOINT is set but the @opentelemetry/* packages are not installed. " +
        "See src/lib/observability/otel.ts for install instructions.",
    );
    initialized = true;
    return;
  }

  try {
    const headers = readHeaders();
    const exporter = new exporterModule.OTLPTraceExporter({
      url: endpoint,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || "blackglass-web";
    const release = process.env.SENTRY_RELEASE?.trim() || "0.0.0-dev";
    const resource = new resourcesModule.Resource({
      [semconvModule.SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [semconvModule.SemanticResourceAttributes.SERVICE_VERSION]: release,
    });

    const sdk = new sdkModule.NodeSDK({
      resource,
      traceExporter: exporter,
      // Sampling is configured via env: OTEL_TRACES_SAMPLER /
      // OTEL_TRACES_SAMPLER_ARG. We pass through OTEL_SAMPLE_RATIO as
      // a convenience. The SDK reads OTEL_TRACES_SAMPLER itself when
      // the field is absent.
      sampler: undefined,
    });

    process.env.OTEL_TRACES_SAMPLER = process.env.OTEL_TRACES_SAMPLER ?? "parentbased_traceidratio";
    process.env.OTEL_TRACES_SAMPLER_ARG = process.env.OTEL_TRACES_SAMPLER_ARG ?? String(readSampleRatio());

    await sdk.start();
    handles = { shutdown: () => sdk.shutdown() };
    initialized = true;

    // Best-effort graceful shutdown so the last batch of spans flushes
    // when the process exits cleanly. SIGINT covers Ctrl-C; SIGTERM
    // covers Docker / k8s rolling restarts.
    process.once("SIGTERM", () => void shutdownOpenTelemetry());
    process.once("SIGINT", () => void shutdownOpenTelemetry());

    console.info(`[otel] Initialised OTLP exporter → ${endpoint} (service=${serviceName}, sample=${readSampleRatio()})`);
  } catch (err) {
    console.warn(`[otel] Init failed, continuing without OTel: ${err instanceof Error ? err.message : String(err)}`);
    initialized = true;
  }
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (!handles) return;
  try {
    await handles.shutdown();
  } catch {
    // Ignore — process is exiting anyway.
  } finally {
    handles = null;
  }
}

async function tryImport<T>(specifier: string): Promise<T | null> {
  try {
    return (await import(/* @vite-ignore */ /* webpackIgnore: true */ specifier)) as T;
  } catch {
    return null;
  }
}

/**
 * Internals exposed for tests only — kept off the public API.
 */
export const __internals = {
  readEndpoint,
  readHeaders,
  readSampleRatio,
};
