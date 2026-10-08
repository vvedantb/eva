import { test, expect } from "vitest";
import {
  mergeBackgroundAgents,
  runningBackgroundAgents,
} from "../convex/_sessions/backgroundAgents";
import { readStopTaskToolUseIds } from "../callback-src/providers/claimPendingTurnParse";

test("mergeBackgroundAgents upserts by toolUseId", () => {
  const merged = mergeBackgroundAgents(
    [
      {
        toolUseId: "tool-a",
        status: "running",
        startedAt: 100,
      },
    ],
    [
      {
        toolUseId: "tool-a",
        status: "completed",
        startedAt: 100,
        settledAt: 200,
      },
      {
        toolUseId: "tool-b",
        status: "running",
        startedAt: 150,
        description: "Find data model",
      },
    ],
  );

  expect(merged).toHaveLength(2);
  expect(merged.find((entry) => entry.toolUseId === "tool-a")).toMatchObject({
    status: "completed",
    settledAt: 200,
  });
  expect(merged.find((entry) => entry.toolUseId === "tool-b")).toMatchObject({
    description: "Find data model",
    status: "running",
  });
});

/**
 * Resuming an Agent via SendMessage mints a new tool_use id for the same task
 * id. The daemon that owned the first one may have died without settling it, so
 * that orphan would block the queue until the 2h cap.
 */
test("a restart of the same task supersedes its orphaned running entry", () => {
  const merged = mergeBackgroundAgents(
    [
      {
        toolUseId: "tool-old",
        taskId: "task-1",
        status: "running",
        startedAt: 100,
        backgrounded: true,
      },
    ],
    [
      {
        toolUseId: "tool-new",
        taskId: "task-1",
        status: "running",
        startedAt: 500,
      },
    ],
  );

  expect(merged).toHaveLength(2);
  expect(merged.find((entry) => entry.toolUseId === "tool-old")).toMatchObject({
    status: "superseded",
    settledAt: 500,
  });
  expect(merged.find((entry) => entry.toolUseId === "tool-new")).toMatchObject({
    status: "running",
  });

  const running = runningBackgroundAgents(merged, 600);
  expect(running).toHaveLength(1);
  expect(running[0]?.toolUseId).toBe("tool-new");
});

test("a restart leaves settled entries and other tasks alone", () => {
  const merged = mergeBackgroundAgents(
    [
      {
        toolUseId: "tool-done",
        taskId: "task-1",
        status: "completed",
        startedAt: 100,
        settledAt: 200,
      },
      {
        toolUseId: "tool-other",
        taskId: "task-2",
        status: "running",
        startedAt: 150,
      },
      {
        toolUseId: "tool-untracked",
        status: "running",
        startedAt: 160,
      },
    ],
    [
      {
        toolUseId: "tool-new",
        taskId: "task-1",
        status: "running",
        startedAt: 500,
      },
    ],
  );

  expect(merged.find((entry) => entry.toolUseId === "tool-done")).toMatchObject(
    {
      status: "completed",
      settledAt: 200,
    },
  );
  expect(
    merged.find((entry) => entry.toolUseId === "tool-other"),
  ).toMatchObject({ status: "running" });
  expect(
    merged.find((entry) => entry.toolUseId === "tool-untracked"),
  ).toMatchObject({ status: "running" });
  expect(runningBackgroundAgents(merged, 600).map((e) => e.toolUseId)).toEqual([
    "tool-other",
    "tool-untracked",
    "tool-new",
  ]);
});

test("readStopTaskToolUseIds unwraps Convex HTTP envelope", () => {
  expect(
    readStopTaskToolUseIds({
      status: "success",
      value: {
        prompt: null,
        attachmentUrls: [],
        stopTaskToolUseIds: ["tool-1", "tool-2"],
      },
    }),
  ).toEqual(["tool-1", "tool-2"]);

  expect(
    readStopTaskToolUseIds({
      prompt: null,
      stopTaskToolUseIds: ["tool-3"],
    }),
  ).toEqual(["tool-3"]);
});
