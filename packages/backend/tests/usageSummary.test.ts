import { describe, expect, test } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  UNKNOWN_MODEL,
  bucketStartFor,
  summariseUsage,
} from "../convex/_logs/usageSummary";

const T0 = Date.UTC(2026, 8, 1, 12, 0, 0); // 01 Sep 2026 12:00 UTC

function row(fields: {
  createdAt?: number;
  costUsd?: number;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}) {
  return { createdAt: T0, ...fields };
}

describe("bucketStartFor", () => {
  test("floors to the UTC bucket when the offset is zero", () => {
    expect(bucketStartFor(T0 + 5 * 60_000, HOUR_MS, 0)).toBe(T0);
    expect(bucketStartFor(T0, DAY_MS, 0)).toBe(Date.UTC(2026, 8, 1));
  });

  /**
   * `getTimezoneOffset` is UTC minus local: -60 for BST. 00:30 BST is 23:30
   * UTC the previous day; the local-day bucket must still be 1 Sep 00:00 BST.
   */
  test("aligns day buckets to the caller's local midnight", () => {
    const bstMidnight = Date.UTC(2026, 7, 31, 23, 0, 0); // 1 Sep 00:00 BST
    const tzMs = -60 * 60_000;
    expect(bucketStartFor(bstMidnight + 30 * 60_000, DAY_MS, tzMs)).toBe(
      bstMidnight,
    );
    expect(bucketStartFor(bstMidnight - 1, DAY_MS, tzMs)).toBe(
      bstMidnight - DAY_MS,
    );
  });

  test("positive offsets (west of UTC) shift the other way", () => {
    const nyMidnight = Date.UTC(2026, 8, 1, 4, 0, 0); // 1 Sep 00:00 EDT
    const tzMs = 240 * 60_000;
    expect(bucketStartFor(nyMidnight + HOUR_MS, DAY_MS, tzMs)).toBe(
      nyMidnight,
    );
  });
});

describe("summariseUsage", () => {
  test("sums the denormalised columns into period totals", () => {
    const { totals } = summariseUsage(
      [
        row({
          costUsd: 1.5,
          model: "claude-opus-4-6",
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 1_000_000,
          cacheCreationTokens: 5,
        }),
        row({
          costUsd: 0.25,
          model: "claude-haiku-4-5",
          inputTokens: 40,
          outputTokens: 5,
        }),
      ],
      { bucketMs: DAY_MS, tzOffsetMs: 0 },
    );

    expect(totals.costUsd).toBeCloseTo(1.75);
    expect(totals.inputTokens).toBe(140);
    expect(totals.outputTokens).toBe(25);
    expect(totals.cacheReadTokens).toBe(1_000_000);
    expect(totals.cacheCreationTokens).toBe(5);
    expect(totals.completions).toBe(2);
    expect(totals.unpricedCompletions).toBe(0);
    // Opus 4.6: 1M cache reads × ($5 − $0.50) / 1M.
    expect(totals.cacheSavingsUsd).toBeCloseTo(4.5);
  });

  test("unpriced models still count their billed cost but add no savings", () => {
    const { totals, byModel } = summariseUsage(
      [
        row({ costUsd: 2, model: "gpt-5.5", cacheReadTokens: 500_000 }),
        row({ costUsd: 1, model: "claude-sonnet-4-6", cacheReadTokens: 0 }),
      ],
      { bucketMs: DAY_MS, tzOffsetMs: 0 },
    );

    expect(totals.costUsd).toBeCloseTo(3);
    expect(totals.unpricedCompletions).toBe(1);
    expect(totals.cacheSavingsUsd).toBe(0);
    expect(byModel.find((m) => m.model === "gpt-5.5")?.unpricedCompletions).toBe(
      1,
    );
  });

  test("rows without usage columns group under the unknown model", () => {
    const { totals, byModel } = summariseUsage([row({}), row({})], {
      bucketMs: DAY_MS,
      tzOffsetMs: 0,
    });

    expect(totals.completions).toBe(2);
    expect(totals.unpricedCompletions).toBe(2);
    expect(totals.costUsd).toBe(0);
    expect(Number.isNaN(totals.inputTokens)).toBe(false);
    expect(byModel).toEqual([
      expect.objectContaining({ model: UNKNOWN_MODEL, completions: 2 }),
    ]);
  });

  test("byModel is ordered by spend and keeps the first provider seen", () => {
    const { byModel } = summariseUsage(
      [
        row({ costUsd: 0.1, model: "claude-haiku-4-5", provider: "claude" }),
        row({ costUsd: 5, model: "gpt-5.5", provider: "codex" }),
        row({ costUsd: 0.4, model: "claude-haiku-4-5" }),
      ],
      { bucketMs: DAY_MS, tzOffsetMs: 0 },
    );

    expect(byModel.map((m) => m.model)).toEqual(["gpt-5.5", "claude-haiku-4-5"]);
    expect(byModel[1]?.provider).toBe("claude");
    expect(byModel[1]?.costUsd).toBeCloseTo(0.5);
    expect(byModel[1]?.completions).toBe(2);
  });

  test("buckets are keyed by bucket start and model, sorted chronologically", () => {
    const { buckets } = summariseUsage(
      [
        row({ createdAt: T0 + HOUR_MS, costUsd: 1, model: "b", inputTokens: 1 }),
        row({ createdAt: T0 + 10, costUsd: 2, model: "a", outputTokens: 3 }),
        row({ createdAt: T0 + 20, costUsd: 3, model: "a" }),
        row({ createdAt: T0 + 30, costUsd: 4, model: "b" }),
      ],
      { bucketMs: HOUR_MS, tzOffsetMs: 0 },
    );

    expect(buckets).toEqual([
      {
        bucketStart: T0,
        model: "a",
        costUsd: 5,
        completions: 2,
        inputTokens: 0,
        outputTokens: 3,
      },
      {
        bucketStart: T0,
        model: "b",
        costUsd: 4,
        completions: 1,
        inputTokens: 0,
        outputTokens: 0,
      },
      {
        bucketStart: T0 + HOUR_MS,
        model: "b",
        costUsd: 1,
        completions: 1,
        inputTokens: 1,
        outputTokens: 0,
      },
    ]);
  });

  test("an empty period is all zeros", () => {
    const summary = summariseUsage([], { bucketMs: DAY_MS, tzOffsetMs: 0 });
    expect(summary.totals.completions).toBe(0);
    expect(summary.totals.costUsd).toBe(0);
    expect(summary.byModel).toEqual([]);
    expect(summary.buckets).toEqual([]);
  });
});
