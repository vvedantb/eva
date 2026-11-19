import { test, expect, beforeEach } from "vitest";
import { callbackState as S, resetStateForTests } from "../runtime/state.js";
import {
  diffNewBackgroundTaskIds,
  parseClaudeSdkTaxonomy,
  resetSdkTaxonomyStateForTest,
} from "../parse/sdkTaxonomy.js";
import { applyCanonicalEvents } from "../parse/canonical.js";

beforeEach(() => {
  resetStateForTests();
  resetSdkTaxonomyStateForTest();
});

test("parseClaudeSdkTaxonomy maps compacting status and completes on next message", () => {
  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "system",
      subtype: "status",
      status: "compacting",
    }),
  );
  expect(S.accumulatedSteps).toHaveLength(1);
  expect(S.accumulatedSteps[0]).toMatchObject({
    type: "status",
    label: "Compacting context...",
    status: "active",
  });

  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "system",
      subtype: "compact_boundary",
    }),
  );
  expect(S.accumulatedSteps[0]?.status).toBe("complete");
  expect(S.accumulatedSteps[1]).toMatchObject({
    type: "notice",
    label: "Context compacted",
    status: "complete",
  });
});

test("parseClaudeSdkTaxonomy captures rate limits without a timeline row", () => {
  expect(
    parseClaudeSdkTaxonomy({
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed_warning",
        rateLimitType: "seven_day",
        utilization: 91,
      },
    }),
  ).toEqual([]);
  expect(S.accumulatedSteps).toHaveLength(0);
  expect(S.usageLimitSnapshot).toEqual({
    completeness: "partial",
    status: "allowed_warning",
    windows: [
      { key: "seven_day", label: "Weekly (all models)", utilization: 91 },
    ],
  });
});

test("parseClaudeSdkTaxonomy patches tool progress onto active step", () => {
  S.accumulatedSteps.push({
    type: "tool",
    label: "Running command...",
    toolUseId: "tool-1",
    status: "active",
  });
  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "tool_progress",
      tool_use_id: "tool-1",
      elapsed_time_seconds: 12.4,
    }),
  );
  expect(S.accumulatedSteps[0]?.detail).toBe("12s elapsed");
});

test("parseClaudeSdkTaxonomy applies a summary to the steps it names", () => {
  S.accumulatedSteps.push(
    { type: "tool", label: "One", toolUseId: "tool-1", status: "active" },
    { type: "tool", label: "Two", toolUseId: "tool-2", status: "active" },
    { type: "tool", label: "Three", toolUseId: "tool-3", status: "active" },
  );
  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "tool_use_summary",
      summary: " Explored the repo ",
      preceding_tool_use_ids: ["tool-1", " tool-2 ", "", 7],
    }),
  );
  expect(S.accumulatedSteps.map((step) => step.detail)).toEqual([
    "Explored the repo",
    "Explored the repo",
    undefined,
  ]);
});

test("parseClaudeSdkTaxonomy tolerates padded and blank hook fields", () => {
  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "system",
      subtype: "hook_started",
      hook_id: " hook-1 ",
      hook_name: "   ",
    }),
  );
  expect(S.accumulatedSteps[0]).toMatchObject({
    type: "hook",
    label: "Hook",
    toolUseId: "hook-1",
    status: "active",
  });

  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "system",
      subtype: "hook_progress",
      hook_id: "hook-1",
      output: "  ",
      stdout: " ran checks ",
    }),
  );
  expect(S.accumulatedSteps[0]?.detail).toBe("ran checks");

  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "system",
      subtype: "hook_response",
      hook_id: "hook-1",
    }),
  );
  expect(S.accumulatedSteps[0]?.status).toBe("complete");
});

test("parseClaudeSdkTaxonomy lists persisted files, skipping junk entries", () => {
  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "system",
      subtype: "files_persisted",
      files: [
        { filename: " a.ts " },
        "junk",
        {},
        { filename: 7 },
        null,
        { filename: "b.ts" },
      ],
    }),
  );
  expect(S.accumulatedSteps[0]).toMatchObject({
    type: "notice",
    label: "Files persisted",
    detail: "a.ts, b.ts",
  });

  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "system",
      subtype: "files_persisted",
      files: "a.ts",
    }),
  );
  expect(S.accumulatedSteps[1]).toMatchObject({
    label: "Files persisted",
    detail: undefined,
  });
});

test("parseClaudeSdkTaxonomy announces new background tasks by description", () => {
  applyCanonicalEvents(
    parseClaudeSdkTaxonomy({
      type: "system",
      subtype: "background_tasks_changed",
      tasks: [
        { task_id: " task-1 ", description: " Long build " },
        { task_id: "task-2" },
        { description: "no id" },
        "junk",
      ],
    }),
  );
  expect(S.accumulatedSteps.map((step) => step.detail)).toEqual([
    "Long build",
    "task-2",
  ]);
});

test("parseClaudeSdkTaxonomy ignores malformed events without throwing", () => {
  for (const event of [
    {},
    { type: "   " },
    { type: 7 },
    { type: "system", subtype: 7 },
    { type: "system", subtype: "status", status: " compacting " },
    {
      type: "tool_progress",
      tool_use_id: "tool-1",
      elapsed_time_seconds: "12",
    },
    { type: "system", subtype: "hook_started", hook_name: "Hook" },
  ]) {
    expect(parseClaudeSdkTaxonomy(event)).toEqual([]);
  }
  expect(S.accumulatedSteps).toHaveLength(0);
});

test("diffNewBackgroundTaskIds returns only unseen task ids", () => {
  expect(diffNewBackgroundTaskIds(["a", "b"])).toEqual(["a", "b"]);
  expect(diffNewBackgroundTaskIds(["b", "c"])).toEqual(["c"]);
});
