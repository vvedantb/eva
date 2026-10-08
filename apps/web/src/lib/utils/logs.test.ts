import { expect, test } from "vitest";
import {
  formatCost,
  formatTokens,
  getTotalInputTokens,
  parseResultEvent,
} from "./logs";

test("parseResultEvent keeps input vs cache token categories separate", () => {
  // Cost UI must not treat cache reads as billed input tokens.
  const event = parseResultEvent(
    JSON.stringify({
      total_cost_usd: 1.25,
      provider: "anthropic",
      duration_ms: 1200,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 200,
      },
      modelUsage: {
        "claude-sonnet": { costUSD: 1.25 },
        other: { costUSD: 0.1 },
      },
    }),
  );

  expect(event.inputTokens).toBe(100);
  expect(event.cacheReadTokens).toBe(1000);
  expect(event.cacheCreationTokens).toBe(200);
  expect(event.outputTokens).toBe(50);
  expect(event.model).toBe("claude-sonnet");
  expect(getTotalInputTokens(event)).toBe(1300);
  expect(event.contextUsedTokens).toBe(1350);
  expect(event.contextWindow).toBe(0);
});

test("parseResultEvent uses last iteration occupancy and model context window", () => {
  const event = parseResultEvent(
    JSON.stringify({
      total_cost_usd: 18.19,
      provider: "claude",
      duration_ms: 23918,
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
  );

  expect(event.model).toBe("claude-opus-5");
  expect(event.contextWindow).toBe(1_000_000);
  expect(event.cacheReadTokens).toBe(1_316_586);
  expect(event.contextUsedTokens).toBe(2 + 78 + 264_662 + 480);
});

test("parseResultEvent returns empty defaults for invalid JSON", () => {
  expect(parseResultEvent(undefined).inputTokens).toBe(0);
  expect(parseResultEvent("{").model).toBe("-");
});

test("formatTokens uses compact suffixes", () => {
  expect(formatTokens(0)).toBe("0");
  expect(formatTokens(1500)).toBe("1.5k");
  expect(formatTokens(2_000_000)).toBe("2.0M");
});

test("formatCost shows USD to the cent, with more precision under a cent", () => {
  expect(formatCost(1.5)).toBe("$1.50");
  expect(formatCost(1234.567)).toBe("$1,234.57");
  expect(formatCost(0)).toBe("$0.00");
  expect(formatCost(0.004)).toBe("$0.004");
  expect(formatCost(0.00042)).toBe("$0.0004");
  expect(formatCost(Number.NaN)).toBe("$0.00");
});
