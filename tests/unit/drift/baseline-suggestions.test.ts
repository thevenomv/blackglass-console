/**
 * Unit tests for the baseline-suggestion helpers.
 *
 * The SQL aggregation needs a live Postgres + RLS context; that
 * lives in the integration suite. These tests cover the env-var
 * config parsers + the airgap-style guards that don't need a DB.
 */

import { afterEach, describe, expect, it } from "vitest";
import { __internals } from "@/lib/server/services/baseline-suggestions-service";

const { readMinHosts, readMinAgeDays } = __internals;

const ENV_KEYS = ["BASELINE_SUGGESTION_MIN_HOSTS", "BASELINE_SUGGESTION_MIN_AGE_DAYS"] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("baseline-suggestions config", () => {
  it("readMinHosts defaults to 3", () => {
    expect(readMinHosts()).toBe(3);
  });

  it("readMinHosts honours valid values", () => {
    process.env.BASELINE_SUGGESTION_MIN_HOSTS = "5";
    expect(readMinHosts()).toBe(5);
  });

  it("readMinHosts floors at 2 (a single-host pattern is just one host's drift)", () => {
    process.env.BASELINE_SUGGESTION_MIN_HOSTS = "1";
    expect(readMinHosts()).toBe(3);
    process.env.BASELINE_SUGGESTION_MIN_HOSTS = "0";
    expect(readMinHosts()).toBe(3);
  });

  it("readMinHosts caps at 50", () => {
    process.env.BASELINE_SUGGESTION_MIN_HOSTS = "9999";
    expect(readMinHosts()).toBe(50);
  });

  it("readMinHosts falls back on garbage", () => {
    process.env.BASELINE_SUGGESTION_MIN_HOSTS = "not-a-number";
    expect(readMinHosts()).toBe(3);
  });

  it("readMinAgeDays defaults to 7", () => {
    expect(readMinAgeDays()).toBe(7);
  });

  it("readMinAgeDays caps at 365", () => {
    process.env.BASELINE_SUGGESTION_MIN_AGE_DAYS = "1000";
    expect(readMinAgeDays()).toBe(365);
  });

  it("readMinAgeDays floors at 1", () => {
    process.env.BASELINE_SUGGESTION_MIN_AGE_DAYS = "0";
    expect(readMinAgeDays()).toBe(7);
    process.env.BASELINE_SUGGESTION_MIN_AGE_DAYS = "-3";
    expect(readMinAgeDays()).toBe(7);
  });
});
