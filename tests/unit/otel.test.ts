/**
 * Unit tests for the OpenTelemetry env-parsing helpers.
 *
 * The actual SDK init is exercised via the integration suite (it
 * dynamic-imports the @opentelemetry/* packages, which we don't want to
 * pin as required deps in the unit test runtime). These tests focus on
 * the pure parsing functions exposed via __internals.
 */

import { afterEach, describe, expect, it } from "vitest";
import { __internals } from "@/lib/observability/otel";

const { readEndpoint, readHeaders, readSampleRatio } = __internals;

const ENV_KEYS = [
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_SAMPLE_RATIO",
] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("otel env parsing", () => {
  it("readEndpoint returns null when unset or whitespace", () => {
    expect(readEndpoint()).toBeNull();
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "   ";
    expect(readEndpoint()).toBeNull();
  });

  it("readEndpoint returns the trimmed URL when set", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "  https://otlp.example.com/v1/traces  ";
    expect(readEndpoint()).toBe("https://otlp.example.com/v1/traces");
  });

  it("readHeaders parses comma-separated key=value pairs", () => {
    process.env.OTEL_EXPORTER_OTLP_HEADERS =
      "Authorization=Bearer xyz,X-Tenant=acme";
    expect(readHeaders()).toEqual({
      Authorization: "Bearer xyz",
      "X-Tenant": "acme",
    });
  });

  it("readHeaders skips malformed pairs without crashing", () => {
    process.env.OTEL_EXPORTER_OTLP_HEADERS = "valid=1,nokeysep,=novalue,k=v";
    expect(readHeaders()).toEqual({ valid: "1", k: "v" });
  });

  it("readHeaders returns {} when env var is empty", () => {
    expect(readHeaders()).toEqual({});
    process.env.OTEL_EXPORTER_OTLP_HEADERS = "   ";
    expect(readHeaders()).toEqual({});
  });

  it("readSampleRatio defaults to 0.1", () => {
    expect(readSampleRatio()).toBe(0.1);
  });

  it("readSampleRatio honours valid values", () => {
    process.env.OTEL_SAMPLE_RATIO = "0.5";
    expect(readSampleRatio()).toBe(0.5);
    process.env.OTEL_SAMPLE_RATIO = "1";
    expect(readSampleRatio()).toBe(1);
  });

  it("readSampleRatio caps at 1 and floors at 0", () => {
    process.env.OTEL_SAMPLE_RATIO = "5";
    expect(readSampleRatio()).toBe(1);
    process.env.OTEL_SAMPLE_RATIO = "-0.5";
    expect(readSampleRatio()).toBe(0.1);
  });

  it("readSampleRatio falls back to 0.1 on garbage input", () => {
    process.env.OTEL_SAMPLE_RATIO = "not-a-number";
    expect(readSampleRatio()).toBe(0.1);
  });
});
