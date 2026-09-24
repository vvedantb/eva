import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * Quick task chat now takes follow-ups while the task's own run is going, the
 * way session chat always has. That puts two new obligations on the backend:
 * the run must count as busy so a drain cannot start a chat turn on top of it
 * (two agents, one sandbox), and the run winding down must drain the queue —
 * nothing else does, so a follow-up typed during the first run would sit there
 * forever.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

const testsDir = dirname(fileURLToPath(import.meta.url));

async function fixture(overrides?: { activeWorkflowId?: string }) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|runner" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const now = Date.now();
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Ran once",
      status: "in_progress" as const,
      repoId,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      ...(overrides?.activeWorkflowId !== undefined
        ? { activeWorkflowId: overrides.activeWorkflowId }
        : {}),
    });
    await ctx.db.insert("queuedMessages", {
      parentId: taskId,
      content: "and also rename the button",
      createdAt: now,
      order: now,
      userId,
      model: "claude:sonnet" as const,
    });
    return { taskId, userId };
  });
  return { t, ...ids };
}

function queueLength(
  t: ReturnType<typeof convexTest>,
  taskId: Id<"agentTasks">,
) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", taskId))
      .collect();
    return rows.length;
  });
}

describe("a follow-up queued while a task run is going", () => {
  test(
    "is left alone while the run still owns the task",
    async () => {
      const { t, taskId } = await fixture({ activeWorkflowId: "wf-run" });

      await t.mutation(internal._queues.helpers.drainQueueAfterBackgroundAgents, {
        parentId: taskId,
      });

      expect(await queueLength(t, taskId)).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "is left alone while another run is still queued behind this one",
    async () => {
      const { t, taskId, userId } = await fixture({
        activeWorkflowId: "wf-run",
      });
      await t.run((ctx) =>
        ctx.db.insert("agentRuns", {
          taskId,
          status: "queued" as const,
          logs: [],
          startedAt: Date.now(),
          triggeredBy: userId,
        }),
      );

      await t.mutation(internal.taskWorkflow.clearActiveWorkflow, { taskId });

      // The next run will own the sandbox, so the follow-up keeps waiting.
      expect(await queueLength(t, taskId)).toBe(1);
      expect((await t.run((ctx) => ctx.db.get(taskId)))?.activeWorkflowId).toBe(
        "wf-run",
      );
    },
    TIMEOUT_MS,
  );
});

test("the run's wind-down is what drains the task chat queue", () => {
  const source = readFileSync(
    join(testsDir, "../convex/_taskWorkflow/scheduling.ts"),
    "utf8",
  );
  const start = source.indexOf("export const clearActiveWorkflow");
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start);
  expect(body).toContain("await startNextQueuedTaskChatMessage(ctx, args.taskId)");
});

test("a task's own run counts as busy in the shared dequeue gate", () => {
  const source = readFileSync(
    join(testsDir, "../convex/_queues/helpers.ts"),
    "utf8",
  );
  expect(source).toContain("task.activeWorkflowId !== undefined");
});
