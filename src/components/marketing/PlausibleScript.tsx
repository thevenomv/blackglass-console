import Script from "next/script";

/**
 * Plausible Analytics — privacy-first, cookie-free, no PII.
 *
 * Loaded only on public marketing routes when `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`
 * is set. Renders nothing in dev (or any environment without the env var)
 * so local development stays quiet and self-hosted deployments can opt in
 * without code changes.
 *
 * The inline shim queues `plausible(...)` calls fired before the main
 * script loads — this is Plausible's official recipe and means our
 * `trackToolEvent` shim in `src/lib/tools/analytics.ts` can fire events
 * without worrying about script load timing.
 *
 * Self-hosted Plausible: set `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` to your
 * own script URL (e.g. https://analytics.example.com/js/script.js).
 *
 * Privacy stance:
 *   - No cookies. No localStorage. No cross-site tracking. No fingerprinting.
 *   - Aggregated counts only — designed to be GDPR/CCPA/PECR compliant
 *     without a consent banner.
 *   - Loads on `/tools/*`, `/product`, `/pricing`, etc. — NEVER on the
 *     authenticated `(app)` console (which lives under a different layout).
 */
export function PlausibleScript() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;

  const scriptUrl =
    process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL ||
    "https://plausible.io/js/script.js";

  return (
    <>
      <Script
        defer
        data-domain={domain}
        src={scriptUrl}
        strategy="afterInteractive"
      />
      <Script id="plausible-queue" strategy="afterInteractive">
        {`window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}`}
      </Script>
    </>
  );
}
