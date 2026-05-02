// @ts-nocheck — zod-to-json-schema typings target Zod 3; runtime accepts Zod 4 schemas.
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const bundle = {
  $comment:
    "Generated from src/lib/server/http/schemas.ts — keep in sync via npm run schemas:export",
  ScanPostBody: zodToJsonSchema(ScanPostBodySchema, {
    name: "ScanPostBody",
    $refStrategy: "none",
  }),
  AuditPostBody: zodToJsonSchema(AuditPostBodySchema, {
    name: "AuditPostBody",
    $refStrategy: "none",
  }),
  AuditEventsQuery: zodToJsonSchema(AuditEventsQuerySchema, {
    name: "AuditEventsQuery",
    $refStrategy: "none",
  }),
  DriftQuery: zodToJsonSchema(DriftQuerySchema, {
    name: "DriftQuery",
    $refStrategy: "none",
  }),
  ResourceIdPath: zodToJsonSchema(ResourceIdPathSchema, {
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
