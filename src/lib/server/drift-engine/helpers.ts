/**
 * Leaf utilities shared by the per-category compute modules.
 *
 * Kept in their own file so the per-category compute modules can be
 * unit-tested without pulling in storage or Postgres dependencies.
 */

export function id(prefix: string, suffix: string): string {
  return `${prefix}-${suffix.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 32)}`;
}

export function now(): string {
  return new Date().toISOString();
}
