import { describe, expect, test } from "vitest";
import {
  MAX_PARALLEL_PROJECT_TASKS,
  hasDependencyCycle,
  projectStatus,
  projectTaskDisplayStatus,
  projectTaskNeedsYou,
  projectTaskStage,
  projectTaskWaitsForCoordinator,
  tasksToStart,
  type ProjectTaskFacts,
} from "@eva/shared/projectStatus";

/**
 * The derived project status and the scheduler's pick, shared by web, phone
 * and `scheduleReadyTasks`. Plan check: A, B (depends on A), C. Approve all:
 * A and C start together; B starts only after A's PR merges; a failed C
 * stops nobody.
 */

function task(
  id: string,
  taskNumber: number,
  facts: Partial<ProjectTaskFacts> = {},
): ProjectTaskFacts {
  return {
    id,
    taskNumber,
    status: "todo",
    approved: true,
    usageLimited: false,
    runPending: false,
    dependencies: [],
    ...facts,
  };
}

describe("tasksToStart", () => {
  test("starts independent approved tasks together and holds a dependent until its PR merges", () => {
    const a = task("a", 1);
    const b = task("b", 2, { dependencies: [{ status: "todo" }] });
    const c = task("c", 3);
    expect(tasksToStart([a, b, c])).toEqual(["a", "c"]);

    // A is done but its PR is still open: B waits.
    const bWaiting = task("b", 2, {
      dependencies: [{ status: "done", prState: "open" }],
    });
    expect(tasksToStart([bWaiting])).toEqual([]);

    // A's PR merged: B starts. C failed meanwhile and does not block it.
    const bReady = task("b", 2, {
      dependencies: [{ status: "done", prState: "merged" }],
    });
    const cFailed = task("c", 3, { halted: "failed" });
    expect(tasksToStart([bReady, cFailed])).toEqual(["b"]);
  });

  test("keeps at most the parallel limit in progress, in task number order", () => {
    const running = Array.from({ length: MAX_PARALLEL_PROJECT_TASKS - 1 }, (_, i) =>
      task(`run${i}`, i + 1, { status: "in_progress" }),
    );
    const waiting = [task("w9", 9), task("w5", 5), task("w7", 7)];
    expect(tasksToStart([...running, ...waiting])).toEqual(["w5"]);
    // A second call on the state after that start picks nothing.
    const started = task("w5", 5, { status: "in_progress" });
    expect(
      tasksToStart([...running, started, task("w9", 9), task("w7", 7)]),
    ).toEqual([]);
  });

  test("skips unapproved, halted, pending and usage-limited work", () => {
    expect(
      tasksToStart([
        task("unapproved", 1, { approved: false }),
        task("stopped", 2, { halted: "cancelled" }),
        task("retrying", 3, { runPending: true }),
        task("blockedByCancel", 4, {
          dependencies: [{ status: "cancelled" }],
        }),
      ]),
    ).toEqual([]);
    // The project's account is at its limit: nothing new starts.
    expect(
      tasksToStart([task("limited", 1, { usageLimited: true }), task("x", 2)]),
    ).toEqual([]);
  });
});

describe("project status", () => {
  test("a task is launched only once done and merged", () => {
    expect(projectTaskStage({ status: "done", prState: "merged" })).toBe(
      "launched",
    );
    expect(projectTaskStage({ status: "done" })).toBe("launched");
    expect(projectTaskStage({ status: "done", prState: "open" })).toBe(
      "in_review",
    );
    expect(projectTaskStage({ status: "business_review" })).toBe("in_review");
    expect(projectTaskStage({ status: "draft" })).toBe("todo");
  });

  test("a project is todo until a task starts, done once every task is launched or cancelled, else in progress", () => {
    expect(projectStatus([]).stage).toBe("todo");
    expect(
      projectStatus([task("a", 1), task("b", 2, { status: "draft" })]).stage,
    ).toBe("todo");
    expect(
      projectStatus([
        task("a", 1, { status: "done", prState: "merged" }),
        task("b", 2, { status: "cancelled" }),
      ]).stage,
    ).toBe("done");
    // A new task reopens it: some launched while others remain.
    const reopened = projectStatus([
      task("a", 1, { status: "done", prState: "merged" }),
      task("c", 3, { approved: false }),
    ]);
    expect(reopened.stage).toBe("in_progress");
    expect(reopened.needsYou).toEqual([{ id: "c", reason: "approve" }]);
    expect(reopened.counts).toEqual({
      working: 0,
      blocked: 1,
      idle: 0,
      archived: 1,
    });
    expect(
      projectStatus([task("a", 1, { status: "in_progress" }), task("b", 2)])
        .stage,
    ).toBe("in_progress");
    // A task in review alone keeps the project in progress.
    const reviewing = projectStatus([
      task("a", 1, { status: "code_review" }),
      task("b", 2),
    ]);
    expect(reviewing.stage).toBe("in_progress");
    expect(reviewing.counts).toEqual({
      working: 0,
      blocked: 1,
      idle: 1,
      archived: 0,
    });
  });

  test("a first failure is the coordinator's; a failure after its retry needs a person", () => {
    expect(
      projectTaskNeedsYou(task("a", 1, { halted: "failed" })),
    ).toBeUndefined();
    expect(
      projectTaskNeedsYou(
        task("a", 1, { halted: "failed", coordinatorRetries: 0 }),
      ),
    ).toBeUndefined();
    expect(
      projectTaskNeedsYou(
        task("a", 1, { halted: "failed", coordinatorRetries: 1 }),
      ),
    ).toBe("failed");
  });

  test("an open ask waits for the coordinator, then for a person", () => {
    const waiting = task("a", 1, {
      status: "in_progress",
      openAsk: "coordinator",
    });
    expect(projectTaskWaitsForCoordinator(waiting)).toBe(true);
    expect(projectTaskNeedsYou(waiting)).toBeUndefined();
    // The waiting task keeps its slot: its stage stays in progress.
    expect(projectTaskStage(waiting)).toBe("in_progress");
    expect(projectStatus([waiting]).stage).toBe("in_progress");

    const passed = task("a", 1, { status: "in_progress", openAsk: "person" });
    expect(projectTaskWaitsForCoordinator(passed)).toBe(false);
    expect(projectTaskNeedsYou(passed)).toBe("question");
    expect(
      projectTaskWaitsForCoordinator(task("a", 1, { status: "in_progress" })),
    ).toBe(false);
  });

  test("says why a task needs a person", () => {
    expect(
      projectTaskNeedsYou(
        task("a", 1, { status: "business_review", prState: "closed" }),
      ),
    ).toBe("pr_closed");
    expect(
      projectTaskNeedsYou(
        task("a", 1, { dependencies: [{ status: "cancelled" }] }),
      ),
    ).toBe("dependency_cancelled");
    expect(projectTaskNeedsYou(task("a", 1, { status: "code_review" }))).toBe(
      "review",
    );
    expect(projectTaskNeedsYou(task("a", 1, { usageLimited: true }))).toBe(
      "usage_limit",
    );
    expect(projectTaskNeedsYou(task("a", 1))).toBeUndefined();
  });
});

test("hasDependencyCycle finds a loop, including a task waiting on itself", () => {
  expect(hasDependencyCycle([["b", "a"], ["c", "b"]])).toBe(false);
  expect(hasDependencyCycle([["b", "a"], ["c", "b"], ["a", "c"]])).toBe(true);
  expect(hasDependencyCycle([["a", "a"]])).toBe(true);
});

describe("projectTaskDisplayStatus", () => {
  const cases: Array<[string, Partial<ProjectTaskFacts>, string]> = [
    ["running", { status: "in_progress", runPending: true }, "working"],
    ["unapproved todo", { approved: false }, "blocked"],
    ["unapproved draft", { status: "draft", approved: false }, "blocked"],
    ["PR open", { status: "done", prState: "open" }, "blocked"],
    ["code review", { status: "code_review" }, "blocked"],
    ["business review", { status: "business_review" }, "blocked"],
    [
      "ask for the coordinator",
      { status: "in_progress", openAsk: "coordinator" },
      "blocked",
    ],
    ["ask for a person", { status: "in_progress", openAsk: "person" }, "blocked"],
    ["first failure", { status: "in_progress", halted: "failed" }, "blocked"],
    [
      "failure after the retry",
      { status: "in_progress", halted: "failed", coordinatorRetries: 1 },
      "blocked",
    ],
    ["stopped", { halted: "cancelled" }, "blocked"],
    ["PR closed", { status: "in_progress", prState: "closed" }, "blocked"],
    ["usage limit", { status: "in_progress", usageLimited: true }, "blocked"],
    [
      "cancelled dependency",
      { dependencies: [{ status: "cancelled" }] },
      "blocked",
    ],
    ["approved, waits for a dependency", { dependencies: [{ status: "todo" }] }, "idle"],
    ["approved, waits for a slot", {}, "idle"],
    ["done and merged", { status: "done", prState: "merged" }, "archived"],
    ["done with no PR", { status: "done" }, "archived"],
    ["cancelled", { status: "cancelled", approved: false }, "archived"],
  ];
  test.each(cases)("%s", (_name, facts, expected) => {
    expect(projectTaskDisplayStatus(task("a", 1, facts))).toBe(expected);
  });
});
