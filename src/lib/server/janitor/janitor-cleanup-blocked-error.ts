/**
 * Live cleanup aborted: cloud tags/labels match merged protector markers at execution time.
 */

export class JanitorCleanupBlockedError extends Error {
  constructor(message = "cleanup_blocked_live_protect_check") {
    super(message);
    this.name = "JanitorCleanupBlockedError";
  }
}
