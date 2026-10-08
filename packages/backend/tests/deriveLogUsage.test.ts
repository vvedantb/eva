import { expect, test } from "vitest";
import { deriveLogUsage } from "../convex/_logs/usage";

const event = JSON.stringify({
  type: "result",
  provider: "claude",
  total_cost_usd: 0.42,
  duration_ms: 12_000,
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 900,
    cache_creation_input_tokens: 300,
  },
  modelUsage: {
    "claude-opus-4-6": { costUSD: 0.42, contextWindow: 200_000 },
  },
});

test("deriveLogUsage copies the result event into the usage columns", () => {
  expect(deriveLogUsage(event)).toEqual({
    costUsd: 0.42,
    model: "claude-opus-4-6",
    provider: "claude",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 900,
    cacheCreationTokens: 300,
    durationMs: 12_000,
    contextWindow: 200_000,
  });
});

/**
 * A missing or broken event must leave the columns unset — a zero costUsd
 * would make the row look priced and hide it from the backfill's
 * `costUsd === undefined` guard.
 */
test("deriveLogUsage returns no columns for absent or unparseable events", () => {
  expect(deriveLogUsage(undefined)).toEqual({});
  expect(deriveLogUsage("")).toEqual({});
  expect(deriveLogUsage("{")).toEqual({});
  expect(deriveLogUsage("[]")).toEqual({});
});

test("deriveLogUsage omits the no-model sentinel, empty provider and zero context window", () => {
  const usage = deriveLogUsage(
    JSON.stringify({ total_cost_usd: 0.01, usage: {}, modelUsage: {} }),
  );
  expect(usage.costUsd).toBe(0.01);
  expect(usage.model).toBeUndefined();
  expect(usage.provider).toBeUndefined();
  expect(usage.contextWindow).toBeUndefined();
});
