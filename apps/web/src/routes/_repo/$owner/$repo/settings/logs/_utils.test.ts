import { describe, expect, test } from "vitest";
import {
  bucketStartsBetween,
  buildUsageSeries,
  formatBucketLabel,
  groupKeyFor,
  groupLogsByType,
  labelFor,
  logTotals,
  sharePercent,
  usageOf,
} from "./_utils";

function completion(fields: {
  entityType: string;
  projectId?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}) {
  return {
    entityType: fields.entityType,
    projectId: fields.projectId,
    rawResultEvent: JSON.stringify({
      total_cost_usd: fields.costUsd ?? 0,
      duration_ms: fields.durationMs ?? 0,
      usage: {
        input_tokens: fields.inputTokens ?? 0,
        output_tokens: fields.outputTokens ?? 0,
      },
    }),
  };
}

/**
 * These helpers were inlined across LogsSummaryGrid and ProjectSpendingGroup
 * before the settings/logs consolidation; the numbers they produce are the
 * spend a repo owner is billed against, so a silent drift here is expensive.
 */
describe("project-tagged completions bill as one line", () => {
  test("every project entity type collapses into the project group", () => {
    // Chats, tasks, and interviews under a project must not split the bill
    // across project-chat + quickTask + project rows.
    expect(groupKeyFor({ entityType: "project-chat", projectId: "p1" })).toBe(
      "project",
    );
    expect(groupKeyFor({ entityType: "quickTask", projectId: "p1" })).toBe(
      "project",
    );
  });

  test("untagged completions keep their own entity type", () => {
    expect(groupKeyFor({ entityType: "quickTask" })).toBe("quickTask");
    expect(groupKeyFor({ entityType: "session" })).toBe("session");
  });

  test("groupLogsByType rolls a project's mixed entities into one total", () => {
    const groups = groupLogsByType([
      completion({ entityType: "project-chat", projectId: "p1", costUsd: 1 }),
      completion({ entityType: "quickTask", projectId: "p1", costUsd: 2 }),
      completion({ entityType: "session", costUsd: 0.5 }),
    ]);

    expect(groups.map((group) => group.type)).toEqual(["project", "session"]);
    expect(groups[0].logs).toHaveLength(2);
    expect(groups[0].total).toBeCloseTo(3);
  });

  test("groups are ordered by spend, not by first appearance", () => {
    const groups = groupLogsByType([
      completion({ entityType: "doc", costUsd: 0.1 }),
      completion({ entityType: "session", costUsd: 5 }),
      completion({ entityType: "automation", costUsd: 1 }),
    ]);

    expect(groups.map((group) => group.type)).toEqual([
      "session",
      "automation",
      "doc",
    ]);
  });
});

describe("logTotals sums a period of completions", () => {
  test("cost, tokens, and duration add up across entries", () => {
    const totals = logTotals([
      completion({
        entityType: "session",
        costUsd: 1.5,
        inputTokens: 100,
        outputTokens: 20,
        durationMs: 1000,
      }),
      completion({
        entityType: "quickTask",
        costUsd: 0.25,
        inputTokens: 40,
        outputTokens: 5,
        durationMs: 500,
      }),
    ]);

    expect(totals.totalCost).toBeCloseTo(1.75);
    expect(totals.totalInput).toBe(140);
    expect(totals.totalOutput).toBe(25);
    expect(totals.totalDuration).toBe(1500);
  });

  test("unparseable and missing result events count as zero, never NaN", () => {
    // A single NaN poisons the sum and the summary renders "$NaN".
    const totals = logTotals([
      { entityType: "session", rawResultEvent: "{" },
      { entityType: "doc" },
      completion({ entityType: "session", costUsd: 2, inputTokens: 10 }),
    ]);

    expect(totals.totalCost).toBeCloseTo(2);
    expect(totals.totalInput).toBe(10);
    expect(Number.isNaN(totals.totalOutput)).toBe(false);
    expect(totals.totalDuration).toBe(0);
  });

  test("an empty period totals zero", () => {
    expect(logTotals([])).toEqual({
      totalCost: 0,
      totalInput: 0,
      totalOutput: 0,
      totalDuration: 0,
    });
  });
});

test("an unmapped entity type labels as itself rather than blank", () => {
  expect(labelFor("session")).toBe("Sessions");
  expect(labelFor("brandNewSurface")).toBe("brandNewSurface");
});

describe("usageOf prefers the denormalised columns", () => {
  test("reads the columns when costUsd is set, ignoring the raw event", () => {
    const usage = usageOf({
      entityType: "session",
      costUsd: 3,
      model: "claude-opus-4-6",
      inputTokens: 10,
      outputTokens: 4,
      durationMs: 900,
      // Deliberately disagrees with the columns: it must not be consulted.
      rawResultEvent: JSON.stringify({ total_cost_usd: 99 }),
    });
    expect(usage).toEqual({
      costUsd: 3,
      model: "claude-opus-4-6",
      inputTokens: 10,
      outputTokens: 4,
      durationMs: 900,
    });
  });

  test("falls back to the raw event for rows written before the columns", () => {
    const usage = usageOf(
      completion({ entityType: "session", costUsd: 1.25, inputTokens: 7 }),
    );
    expect(usage.costUsd).toBe(1.25);
    expect(usage.inputTokens).toBe(7);
    expect(usage.model).toBe("-");
  });
});

describe("chart bucketing", () => {
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const T0 = Date.UTC(2026, 8, 1, 12, 0, 0);

  test("bucketStartsBetween covers the window with aligned starts", () => {
    expect(bucketStartsBetween(T0 + 10, T0 + 3 * HOUR, HOUR, 0)).toEqual([
      T0,
      T0 + HOUR,
      T0 + 2 * HOUR,
    ]);
    expect(bucketStartsBetween(T0, T0, HOUR, 0)).toEqual([]);
  });

  test("bucketStartsBetween aligns to the local day boundary", () => {
    // BST: getTimezoneOffset is -60, so local midnight is 23:00 UTC.
    const tzMs = -60 * 60_000;
    const starts = bucketStartsBetween(T0, T0 + DAY, DAY, tzMs);
    expect(starts).toEqual([
      Date.UTC(2026, 7, 31, 23),
      Date.UTC(2026, 8, 1, 23),
    ]);
  });

  test("buildUsageSeries fills gaps with zero and orders models by spend", () => {
    const starts = [T0, T0 + HOUR, T0 + 2 * HOUR];
    const series = buildUsageSeries(
      [
        { bucketStart: T0, model: "haiku", costUsd: 0.1 },
        { bucketStart: T0 + 2 * HOUR, model: "opus", costUsd: 5 },
        { bucketStart: T0, model: "opus", costUsd: 1 },
        // Outside the window: ignored.
        { bucketStart: T0 - HOUR, model: "opus", costUsd: 100 },
      ],
      starts,
    );
    expect(series).toEqual([
      { model: "opus", data: [1, 0, 5] },
      { model: "haiku", data: [0.1, 0, 0] },
    ]);
  });

  test("formatBucketLabel shows the hour for hourly buckets and the date otherwise", () => {
    expect(formatBucketLabel(T0, "hour")).toMatch(/^\d{2}:\d{2}$/);
    expect(formatBucketLabel(T0, "day")).toMatch(/^\d{1,2} \w{3}$/);
  });

  test("sharePercent is a whole number and safe on zero", () => {
    expect(sharePercent(1, 4)).toBe(25);
    expect(sharePercent(2, 3)).toBe(67);
    expect(sharePercent(1, 0)).toBe(0);
  });
});
