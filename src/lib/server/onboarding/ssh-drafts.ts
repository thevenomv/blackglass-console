/**
 * In-process draft store for server-generated SSH keypairs.
 *
 * The SSH-pull onboarding wizard generates an ed25519 keypair server-side
 * (so the user doesn't have to run `ssh-keygen` manually). The public
 * key is shown to the user — they install it on their host. The private
 * key is held here, keyed by a random `keyId`, so the wizard's "Test
 * SSH" button can authenticate from the console without the user
 * pasting the private key into a textarea.
 *
 * Lifetime
 * --------
 *   10 minutes from creation. Long enough for the user to ssh-copy-id,
 *   short enough that a forgotten draft doesn't sit in memory forever.
 *   The draft is also deleted after a successful "Save host" call so
 *   the private key never lingers past the moment it's needed.
 *
 * Persistence
 * -----------
 *   In-memory only. A console restart drops drafts — that's fine
 *   because the user can always click "Generate" again. Multi-instance
 *   App Platform deployments are the same: each instance owns its own
 *   drafts; the wizard sticks to one instance via session affinity.
 */

const DRAFT_TTL_MS = 10 * 60 * 1000;
const MAX_DRAFTS = 256;

type Draft = {
  privateKey: string;
  publicKey: string;
  createdAt: number;
};

const drafts = new Map<string, Draft>();

function gc(): void {
  if (drafts.size <= MAX_DRAFTS) return;
  const now = Date.now();
  for (const [id, draft] of drafts) {
    if (now - draft.createdAt > DRAFT_TTL_MS) drafts.delete(id);
  }
  if (drafts.size <= MAX_DRAFTS) return;
  // Still over the cap — drop the oldest entries until we're under.
  const sorted = [...drafts.entries()].sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  while (drafts.size > MAX_DRAFTS && sorted.length > 0) {
    const next = sorted.shift();
    if (next) drafts.delete(next[0]);
  }
}

export function saveDraft(
  keyId: string,
  publicKey: string,
  privateKey: string,
): void {
  drafts.set(keyId, { publicKey, privateKey, createdAt: Date.now() });
  gc();
}

export function getDraft(keyId: string): Draft | null {
  const draft = drafts.get(keyId);
  if (!draft) return null;
  if (Date.now() - draft.createdAt > DRAFT_TTL_MS) {
    drafts.delete(keyId);
    return null;
  }
  return draft;
}

export function deleteDraft(keyId: string): boolean {
  return drafts.delete(keyId);
}

export function _resetDraftStoreForTests(): void {
  drafts.clear();
}
