/**
 * Dumps JSON Schema for Zod API validation shapes (OpenAPI companion).
 * Run: npm run schemas:export
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AuditEventsQuerySchema,
  AuditPostBodySchema,
  DriftQuerySchema,
  ResourceIdPathSchema,
  ScanPostBodySchema,
} from "../src/lib/server/http/schemas";

/** zod-to-json-schema targets Zod 3 typings; Zod 4 schemas work at runtime. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodLike = any;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const bundle = {
  $comment:
    "Generated from src/lib/server/http/schemas.ts — keep in sync via npm run schemas:export",
  ScanPostBody: zodToJsonSchema(ScanPostBodySchema as ZodLike, {
    name: "ScanPostBody",
    $refStrategy: "none",
  }),
  AuditPostBody: zodToJsonSchema(AuditPostBodySchema as ZodLike, {
    name: "AuditPostBody",
    $refStrategy: "none",
  }),
  AuditEventsQuery: zodToJsonSchema(AuditEventsQuerySchema as ZodLike, {
    name: "AuditEventsQuery",
    $refStrategy: "none",
  }),
  DriftQuery: zodToJsonSchema(DriftQuerySchema as ZodLike, {
    name: "DriftQuery",
    $refStrategy: "none",
  }),
  ResourceIdPath: zodToJsonSchema(ResourceIdPathSchema as ZodLike, {
    name: "ResourceIdPath",
    $refStrategy: "none",
  }),
};

writeFileSync(
  path.join(root, "openapi", "zod-schemas.json"),
  JSON.stringify(bundle, null, 2) + "\n",
  "utf8",
);

console.log("Wrote openapi/zod-schemas.json");
