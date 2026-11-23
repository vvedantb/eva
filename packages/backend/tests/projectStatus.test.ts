import { describe, expect, test } from "vitest";
import {
  MAX_PARALLEL_PROJECT_TASKS,
  hasDependencyCycle,
  projectStatus,
  projectTaskNeedsYou,
  projectTaskStage,
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

  test("an empty project is todo; one with only launched or cancelled tasks is done", () => {
    expect(projectStatus([]).stage).toBe("todo");
    expect(
      projectStatus([
        task("a", 1, { status: "done", prState: "merged" }),
        task("b", 2, { status: "cancelled" }),
      ]).stage,
    ).toBe("done");
    // A new task reopens it.
    const reopened = projectStatus([
      task("a", 1, { status: "done", prState: "merged" }),
      task("c", 3, { approved: false }),
    ]);
    expect(reopened.stage).toBe("todo");
    expect(reopened.needsYou).toEqual([{ id: "c", reason: "approve" }]);
    expect(
      projectStatus([task("a", 1, { status: "in_progress" }), task("b", 2)])
        .stage,
    ).toBe("in_progress");
  });

  test("says why a task needs a person", () => {
    expect(projectTaskNeedsYou(task("a", 1, { halted: "failed" }))).toBe(
      "failed",
    );
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
