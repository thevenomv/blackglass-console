/**
 * Leaf utilities shared by the per-category compute modules.
 *
 * Kept in their own file so the per-category compute modules can be
 * unit-tested without pulling in storage or Postgres dependencies.
 */
import { createHash } from "node:crypto";

export function id(prefix: string, suffix: string): string {
  // Hash the full suffix rather than truncating to avoid collisions when two
  // long suffixes (e.g. firewall rules, file paths) share the same first 32
  // characters after sanitization. The 12-char hash is stable across processes.
  const hash = createHash("sha256").update(suffix).digest("hex").slice(0, 12);
  return `${prefix}-${hash}`;
}

export function now(): string {
  return new Date().toISOString();
}
