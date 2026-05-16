/**
 * Drizzle schema — split per domain.
 *
 * Add a new table:
 *   1. Pick (or create) the right domain module here.
 *   2. Export the table + its `$inferSelect` type alias.
 *   3. Add a `export * from "./<module>";` line below if you created a new module.
 *
 * Cross-references between modules (FK `.references(() => otherTable.id)`)
 * are fine and resolve at module-evaluation time. To keep the module graph
 * acyclic, the only "leaf" tables are in `saas.ts` (everything else FK's into
 * `saasTenants.id`) and `credentials.ts` (referenced by both `hosts` and
 * `sandboxes`). Avoid introducing new circular dependencies.
 */

export * from "./saas";
export * from "./credentials";
export * from "./hosts";
export * from "./sandboxes";
export * from "./evidence";
export * from "./drift";
export * from "./notifications";
export * from "./kms";
export * from "./retention";
export * from "./scan-usage";
export * from "./janitor";
