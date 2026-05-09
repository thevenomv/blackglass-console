/**
 * POST /api/v1/onboarding/ssh-keypair
 *
 * Server-side keypair generator for the SSH-pull onboarding wizard.
 *
 * Returns:
 *   {
 *     keyId:        opaque draft id (stash, used by /ssh-test next)
 *     publicKey:    "ssh-ed25519 AAAA... blackglass-onboarding"
 *     copyCommand:  one-liner the user runs to install the key
 *     privateKey:   PEM, included so the operator can paste it into the
 *                   secret store later — the wizard hides it by default
 *   }
 *
 * The private key is held in memory for 10 minutes (see ssh-drafts.ts)
 * so the wizard's Test SSH button can use it without round-tripping
 * the private material through the browser. After the user saves the
 * collector host config, the draft is deleted.
 *
 * Security
 *   - Returning the private key in the response IS the trade-off. It's
 *     necessary for the operator to paste into a secret manager in a
 *     plain self-host deployment, and it stays on TLS the whole way.
 *     We mark the response as `Cache-Control: no-store, private` and
 *     drop the draft from server memory the moment it's used.
 *   - Auth: same as the rest of /onboarding/* — viewer+ on legacy,
 *     reports.view on SaaS. The endpoint never grants access to any
 *     existing secret material; it only generates fresh keys.
 */

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { jsonWithRequestId } from "@/lib/server/http/saas-api-request";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { requireRole } from "@/lib/server/http/auth-guard";
import { saveDraft } from "@/lib/server/onboarding/ssh-drafts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z
  .object({
    label: z.string().max(120).optional(),
  })
  .optional();

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (isClerkAuthEnabled()) {
    const access = await requireSaasOrLegacyPermission("hosts.manage", [
      "operator",
      "admin",
    ]);
    if (!access.ok) return access.response;
  } else {
    const guard = await requireRole(["operator", "admin"]);
    if (!guard.ok) return guard.response;
  }

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;
  const parsed = BodySchema.safeParse(raw.data);
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);
  const label = parsed.data?.label?.trim() || "blackglass-onboarding";

  let publicKeyLine: string;
  let privateKeyPem: string;
  try {
    // Lazy import: keep ssh2 out of the cold-start path of unrelated routes.
    // Cast lets us avoid a hard type dep on ssh2's internal utility surface.
    const ssh2 = (await import("ssh2")) as unknown as {
      utils: {
        generateKeyPairSync: (
          alg: "ed25519",
        ) => { private: string; public: string };
      };
    };
    const { private: priv, public: pubBare } = ssh2.utils.generateKeyPairSync("ed25519");
    privateKeyPem = priv;
    publicKeyLine = `${pubBare.trim()} ${label}`;
  } catch (err) {
    console.error("[onboarding/ssh-keypair] generation failed:", err);
    return jsonError(
      500,
      "keypair_generation_failed",
      "Could not generate an ed25519 keypair on the server.",
      requestId,
    );
  }

  const keyId = randomBytes(16).toString("hex");
  saveDraft(keyId, publicKeyLine, privateKeyPem);

  // The user runs this on the host they want Blackglass to scan. We
  // default to the `blackglass` user and `~/.ssh/authorized_keys` so
  // it matches what the SSH collector expects out of the box.
  const copyCommand = [
    `# Run on your server (as root or via sudo):`,
    `mkdir -p /home/blackglass/.ssh && \\`,
    `cat >> /home/blackglass/.ssh/authorized_keys <<'EOF'`,
    publicKeyLine,
    `EOF`,
    `chown -R blackglass:blackglass /home/blackglass/.ssh && \\`,
    `chmod 700 /home/blackglass/.ssh && \\`,
    `chmod 600 /home/blackglass/.ssh/authorized_keys`,
  ].join("\n");

  const response = jsonWithRequestId(
    {
      keyId,
      publicKey: publicKeyLine,
      privateKey: privateKeyPem,
      copyCommand,
      expiresInSeconds: 600,
    },
    requestId,
  );
  // Belt + braces: never let an intermediary cache the private key.
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
