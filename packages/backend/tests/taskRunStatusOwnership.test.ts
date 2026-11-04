import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * A run owns its task's `in_progress` status and nothing else. A user who
 * moves the task mid-run (to done, cancelled or a review column) keeps that
 * choice: run completion and the 2h watchdog only reset `in_progress`, and the
 * watchdog still times out the run instead of skipping the moved task. A
 * user cancel follows the same rule: it used to force the task back to todo.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|ada";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function taskWithRun(status: Doc<"agentTasks">["status"]) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Fix login",
      status,
      numId: 1,
      repoId,
      createdAt: 0,
      updatedAt: 0,
      createdBy: userId,
      activeWorkflowId: "wf_run",
    });
    const runId = await ctx.db.insert("agentRuns", {
      taskId,
      repoId,
      status: "running",
      logs: [],
      startedAt: Date.now(),
    });
    return { taskId, runId };
  });
  const readTask = () => t.run(async (ctx) => ctx.db.get(ids.taskId));
  const user = t.withIdentity({ subject: CLERK_ID });
  return { t, user, ...ids, readTask };
}

const completion = {
  success: true,
  error: null,
  prError: null,
  prUrl: null,
  activityLog: null,
};

describe("task status during a run", () => {
  test(
    "completion keeps a status the user picked mid-run",
    async () => {
      const f = await taskWithRun("done");
      await f.t.mutation(internal.taskWorkflow.completeRun, {
        runId: f.runId,
        taskId: f.taskId,
        ...completion,
      });
      const task = await f.readTask();
      expect(task?.status).toBe("done");
      expect(task?.activeWorkflowId).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "completion still moves an in-progress task to review",
    async () => {
      const f = await taskWithRun("in_progress");
      await f.t.mutation(internal.taskWorkflow.completeRun, {
        runId: f.runId,
        taskId: f.taskId,
        ...completion,
      });
      expect((await f.readTask())?.status).toBe("business_review");
    },
    TIMEOUT_MS,
  );

  test(
    "the watchdog times out a run whose task was moved, keeping the status",
    async () => {
      const f = await taskWithRun("code_review");
      await f.t.mutation(internal.taskWorkflow.handleStaleRun, {
        taskId: f.taskId,
        runId: f.runId,
      });
      const task = await f.readTask();
      expect(task?.status).toBe("code_review");
      expect(task?.activeWorkflowId).toBeUndefined();
      const run = await f.t.run(async (ctx) => ctx.db.get(f.runId));
      expect(run?.status).toBe("error");
    },
    TIMEOUT_MS,
  );

  test(
    "a user cancel keeps a status the user picked mid-run",
    async () => {
      const f = await taskWithRun("code_review");
      await f.user.mutation(api.taskWorkflow.cancelExecution, {
        taskId: f.taskId,
      });
      const task = await f.readTask();
      expect(task?.status).toBe("code_review");
      expect(task?.activeWorkflowId).toBeUndefined();
      const run = await f.t.run(async (ctx) => ctx.db.get(f.runId));
      expect(run?.status).toBe("cancelled");
    },
    TIMEOUT_MS,
  );

  test(
    "a user cancel still moves an in-progress task back to todo",
    async () => {
      const f = await taskWithRun("in_progress");
      await f.user.mutation(api.taskWorkflow.cancelExecution, {
        taskId: f.taskId,
      });
      expect((await f.readTask())?.status).toBe("todo");
    },
    TIMEOUT_MS,
  );
});
