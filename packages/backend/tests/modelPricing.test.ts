import { describe, expect, test } from "vitest";
import {
  CLAUDE_PRICING_PER_MILLION,
  computeCacheSavingsUsd,
  normaliseModelId,
  resolveModelPricing,
} from "@eva/shared/modelPricing";

/**
 * Cache savings on the Usage page are derived from these lookups. A miss
 * silently under-reports savings; a wrong prefix match silently reports the
 * wrong model's rate.
 */
describe("resolveModelPricing", () => {
  test("resolves undated ids directly", () => {
    expect(resolveModelPricing("claude-opus-4-6")).toBe(
      CLAUDE_PRICING_PER_MILLION["claude-opus-4-6"],
    );
  });

  test("resolves dated snapshots to their undated row", () => {
    expect(resolveModelPricing("claude-opus-4-5-20251101")).toBe(
      CLAUDE_PRICING_PER_MILLION["claude-opus-4-5"],
    );
    expect(resolveModelPricing("claude-haiku-4-5-20251001")).toBe(
      CLAUDE_PRICING_PER_MILLION["claude-haiku-4-5"],
    );
  });

  test("prefers the longest matching key", () => {
    // fable-5-1 has a different cache-read rate from fable-5.
    expect(resolveModelPricing("claude-fable-5-1")).toBe(
      CLAUDE_PRICING_PER_MILLION["claude-fable-5-1"],
    );
    expect(resolveModelPricing("claude-fable-5-1-20260801")).toBe(
      CLAUDE_PRICING_PER_MILLION["claude-fable-5-1"],
    );
    expect(resolveModelPricing("claude-fable-5")).toBe(
      CLAUDE_PRICING_PER_MILLION["claude-fable-5"],
    );
    // opus-5-5 is cheaper than opus-5; a miss would bill it at opus-5 rates.
    expect(resolveModelPricing("claude-opus-5-5")?.inputPerMillion).toBe(4);
    expect(resolveModelPricing("claude-sonnet-5-5")).toBe(
      CLAUDE_PRICING_PER_MILLION["claude-sonnet-5-5"],
    );
  });

  test("a prefix must end at a segment boundary", () => {
    expect(resolveModelPricing("claude-opus-4-50")).toBeNull();
  });

  test("strips provider prefixes and the [1m] context suffix", () => {
    expect(normaliseModelId("claude:claude-sonnet-4-6[1m]")).toBe(
      "claude-sonnet-4-6",
    );
    expect(normaliseModelId("anthropic/claude-opus-4-6")).toBe(
      "claude-opus-4-6",
    );
    expect(resolveModelPricing("claude:claude-sonnet-4-6[1m]")).toBe(
      CLAUDE_PRICING_PER_MILLION["claude-sonnet-4-6"],
    );
  });

  test("returns null for aliases and unknown models rather than guessing", () => {
    expect(resolveModelPricing("sonnet")).toBeNull();
    expect(resolveModelPricing("gpt-5.5")).toBeNull();
    expect(resolveModelPricing("-")).toBeNull();
    expect(resolveModelPricing("")).toBeNull();
  });

  test("every row cites a source URL and an as-of date", () => {
    for (const [model, row] of Object.entries(CLAUDE_PRICING_PER_MILLION)) {
      expect(row.source, model).toMatch(/^https:\/\//);
      expect(row.asOf, model).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.cacheReadPerMillion, model).toBeLessThan(row.inputPerMillion);
    }
  });
});

describe("computeCacheSavingsUsd", () => {
  test("is tokens times the input minus cache-read spread", () => {
    // Opus 4.6: $5 input, $0.50 cache read → $4.50 saved per MTok.
    expect(computeCacheSavingsUsd("claude-opus-4-6", 1_000_000)).toBeCloseTo(
      4.5,
    );
    expect(computeCacheSavingsUsd("claude-haiku-4-5", 200_000)).toBeCloseTo(
      0.18,
    );
  });

  test("is zero for no cache reads and null for unpriced models", () => {
    expect(computeCacheSavingsUsd("claude-opus-4-6", 0)).toBe(0);
    expect(computeCacheSavingsUsd("claude-opus-4-6", -5)).toBe(0);
    expect(computeCacheSavingsUsd("gpt-5.5", 1_000_000)).toBeNull();
  });
});
