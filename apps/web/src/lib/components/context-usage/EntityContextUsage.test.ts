import { expect, test } from "vitest";
import {
  CONTEXT_OVERLOAD_RATIO,
  aggregateUsage,
  contextCompactsAutomatically,
  contextUsedRatio,
} from "./EntityContextUsage";

test("aggregateUsage uses latest occupancy, not summed cache reads", () => {
  const logs = [
    {
      rawResultEvent: JSON.stringify({
        total_cost_usd: 18.19,
        provider: "claude",
        duration_ms: 1000,
        usage: {
          input_tokens: 10,
          output_tokens: 762,
          cache_read_input_tokens: 1_316_586,
          cache_creation_input_tokens: 4650,
          iterations: [
            {
              input_tokens: 2,
              output_tokens: 78,
              cache_read_input_tokens: 264_662,
              cache_creation_input_tokens: 480,
            },
          ],
        },
        modelUsage: {
          "claude-opus-5": { costUSD: 18.19, contextWindow: 1_000_000 },
        },
      }),
    },
    {
      rawResultEvent: JSON.stringify({
        total_cost_usd: 17.47,
        provider: "claude",
        duration_ms: 1000,
        usage: {
          input_tokens: 174,
          output_tokens: 26911,
          cache_read_input_tokens: 18_332_074,
          cache_creation_input_tokens: 90464,
        },
        modelUsage: {
          "claude-opus-5": { costUSD: 17.47, contextWindow: 1_000_000 },
        },
      }),
    },
  ];

  const aggregated = aggregateUsage(logs);
  expect(aggregated).not.toBeNull();
  if (aggregated === null) return;
  expect(aggregated.usedTokens).toBe(2 + 78 + 264_662 + 480);
  expect(aggregated.maxTokens).toBe(1_000_000);
  expect(aggregated.costs.totalUSD).toBeCloseTo(35.66);
  expect(aggregated.maxTokens).not.toBeNull();
  expect(aggregated.usedTokens / (aggregated.maxTokens ?? 1)).toBeLessThan(1);
});

/** A result event with no `contextWindow`, so the catalogue has to supply one. */
function logFor(model: string) {
  return {
    rawResultEvent: JSON.stringify({
      total_cost_usd: 1.5,
      provider: "claude",
      duration_ms: 1000,
      usage: {
        input_tokens: 100,
        output_tokens: 200,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 300,
      },
      modelUsage: { [model]: { costUSD: 1.5 } },
    }),
  };
}

test("aggregateUsage falls back to the catalogue window for a known model", () => {
  const aggregated = aggregateUsage([logFor("claude-opus-4-6")]);
  expect(aggregated?.maxTokens).toBe(200_000);
  expect(aggregated?.usedTokens).toBe(100 + 200 + 5000 + 300);
});

/**
 * The old map defaulted every unrecognised model to 200k, so a meter reading
 * was always produced and was often wrong. Unknown now stays unknown.
 */
test("aggregateUsage reports a null window for an unknown model", () => {
  const aggregated = aggregateUsage([logFor("some-unreleased-model-9")]);
  expect(aggregated?.maxTokens).toBeNull();
  expect(aggregated?.costs.totalUSD).toBeCloseTo(1.5);
});

test("aggregateUsage prefers the window the result event reports", () => {
  const aggregated = aggregateUsage([
    {
      rawResultEvent: JSON.stringify({
        total_cost_usd: 2,
        provider: "claude",
        duration_ms: 1000,
        usage: {
          input_tokens: 1,
          output_tokens: 2,
          cache_read_input_tokens: 3,
          cache_creation_input_tokens: 4,
        },
        // Same model as the catalogue's 200k entry, but running 1M mode.
        modelUsage: {
          "claude-opus-4-6": { costUSD: 2, contextWindow: 1_000_000 },
        },
      }),
    },
  ]);
  expect(aggregated?.maxTokens).toBe(1_000_000);
});

test("overload is the t3 90% threshold", () => {
  expect(CONTEXT_OVERLOAD_RATIO).toBe(0.9);
  expect(contextUsedRatio(91_000, 100_000)).toBeGreaterThan(
    CONTEXT_OVERLOAD_RATIO,
  );
  expect(contextUsedRatio(80_000, 100_000)).toBeLessThan(
    CONTEXT_OVERLOAD_RATIO,
  );
  expect(contextCompactsAutomatically("claude-opus-5")).toBe(true);
  expect(contextCompactsAutomatically("gpt-4o")).toBe(false);
});

test("an unknown window has no usable ratio", () => {
  expect(contextUsedRatio(50_000, null)).toBe(0);
});
