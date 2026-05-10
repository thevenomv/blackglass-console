import { permanentRedirect } from "next/navigation";

/**
 * Legacy URL — content now lives entirely on `/recover#passphrase` (with optional
 * `?section=passphrase` for programmatic scroll). Permanent redirect avoids the old
 * ping-pong between two nearly-identical help pages.
 */
export default function PassphraseRecoveryRedirect() {
  permanentRedirect("/recover?section=passphrase");
}
