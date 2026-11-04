import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * Cases where a queued chat message used to stay in "Queued" with nothing left
 * to send it: subagents orphaned by a stopped sandbox, a message sent while the
 * sandbox was stopping, and a provider account removed after the enqueue.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

const MINUTE_MS = 60 * 1000;

async function fixture(options: {
  sandboxStatus: "active" | "closed" | "stopping";
  /** A subagent the dead VM never settled, started this long ago. */
  orphanAgentAgeMs?: number;
  /** The queued message names an account that was deleted after the enqueue. */
  deletedAccount?: boolean;
}) {
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
    let providerAccountId: Id<"userProviderAccounts"> | undefined;
    if (options.deletedAccount) {
      providerAccountId = await ctx.db.insert("userProviderAccounts", {
        userId,
        provider: "claude",
        label: "Mine",
        credentials: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.delete(providerAccountId);
    }
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Ran once",
      status: "code_review" as const,
      repoId,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      sandboxId: "sbx-task",
      reviewTaskSandboxStatus: options.sandboxStatus,
      ...(options.orphanAgentAgeMs !== undefined
        ? {
            backgroundAgents: [
              {
                toolUseId: "toolu_orphan",
                description: "explore the repo",
                status: "running",
                startedAt: now - options.orphanAgentAgeMs,
              },
            ],
          }
        : {}),
    });
    await ctx.db.insert("queuedMessages", {
      parentId: taskId,
      content: "and also rename the button",
      createdAt: now,
      order: now,
      userId,
      model: "claude:sonnet" as const,
      providerAccountId,
    });
    return { taskId };
  });
  return { t, ...ids };
}

type TestConvex = Awaited<ReturnType<typeof fixture>>["t"];

function queueLength(t: TestConvex, taskId: Id<"agentTasks">) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", taskId))
      .collect();
    return rows.length;
  });
}

function scheduledDrains(t: TestConvex) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows.filter((row) => row.name.includes("drainQueueQuietly"));
  });
}

describe("a queued message is not stranded", () => {
  // Keeps scheduled sandbox starts from firing after the test finishes.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "subagents orphaned by a stopped sandbox do not stop the wake",
    async () => {
      const { t, taskId } = await fixture({
        sandboxStatus: "closed",
        orphanAgentAgeMs: 10 * MINUTE_MS,
      });

      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: taskId,
      });

      const task = await t.run((ctx) => ctx.db.get(taskId));
      expect(task?.reviewTaskSandboxStatus).toBe("starting");
      expect(await queueLength(t, taskId)).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "the ready sandbox settles subagents the old VM never reported",
    async () => {
      const { t, taskId } = await fixture({
        sandboxStatus: "closed",
        orphanAgentAgeMs: 10 * MINUTE_MS,
      });
      await t.run((ctx) =>
        ctx.db.patch(taskId, { reviewTaskSandboxStatus: "starting" }),
      );

      await t.mutation(internal._agentTasks.sandbox.taskSandboxReady, {
        taskId,
        sandboxId: "sbx-task",
        isNew: false,
      });

      const task = await t.run((ctx) => ctx.db.get(taskId));
      expect(task?.backgroundAgents?.[0]?.status).toBe("stale");
      expect(await scheduledDrains(t)).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "a message sent while stopping wakes Eva once the stop settles",
    async () => {
      const { t, taskId } = await fixture({ sandboxStatus: "stopping" });

      // The enqueue-time drain finds the sandbox mid-stop and waits.
      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: taskId,
      });
      expect(await scheduledDrains(t)).toHaveLength(0);

      await t.mutation(internal._agentTasks.sandbox.markTaskSandboxClosed, {
        taskId,
      });
      expect(await scheduledDrains(t)).toHaveLength(1);

      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: taskId,
      });
      const task = await t.run((ctx) => ctx.db.get(taskId));
      expect(task?.reviewTaskSandboxStatus).toBe("starting");
      expect(await queueLength(t, taskId)).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "a failed stop re-offers the queue on the still-running sandbox",
    async () => {
      const { t, taskId } = await fixture({ sandboxStatus: "stopping" });

      await t.mutation(internal._agentTasks.sandbox.markTaskSandboxClosed, {
        taskId,
        error: "provider timeout",
      });

      const task = await t.run((ctx) => ctx.db.get(taskId));
      expect(task?.reviewTaskSandboxStatus).toBe("active");
      expect(await scheduledDrains(t)).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "a deleted provider account consumes the message with an error",
    async () => {
      const { t, taskId } = await fixture({
        sandboxStatus: "active",
        deletedAccount: true,
      });

      // Used to throw, rolling back the caller and leaving the row at the
      // front of the queue for every later drain to throw on again.
      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: taskId,
      });

      expect(await queueLength(t, taskId)).toBe(0);
      const messages = await t.run((ctx) =>
        ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", taskId))
          .collect(),
      );
      expect(messages.map((message) => message.content)).toEqual([
        "Error: Provider account not found",
      ]);
    },
    TIMEOUT_MS,
  );
});
