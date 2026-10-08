import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  findUsageLimitHold,
  USAGE_LIMIT_QUEUE_RESUME_DELAY_MS,
} from "../convex/_taskWorkflow/usageLimitReset";

/**
 * A chat's queue now waits for two things besides a running turn: a sleeping
 * sandbox (which the queue wakes, so the ready drain can send) and a usage
 * limit the newest turn hit (which holds same-provider messages until just
 * after the reset).
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

const HOUR_MS = 60 * 60 * 1000;

describe("findUsageLimitHold", () => {
  const now = 1_000_000;

  test("holds until the reset plus the resume delay", () => {
    const hold = findUsageLimitHold(
      [
        {
          role: "assistant",
          errorType: "rate_limit",
          limitResetAt: now + HOUR_MS,
        },
        { role: "user", model: "claude:sonnet" },
      ],
      now,
    );
    expect(hold).toEqual({
      resumeAt: now + HOUR_MS + USAGE_LIMIT_QUEUE_RESUME_DELAY_MS,
      model: "claude:sonnet",
    });
  });

  test("looks past system alerts to the newest real turn", () => {
    const hold = findUsageLimitHold(
      [
        { role: "assistant", isSystemAlert: true },
        {
          role: "assistant",
          errorType: "rate_limit",
          limitResetAt: now + HOUR_MS,
        },
      ],
      now,
    );
    expect(hold?.model).toBeUndefined();
    expect(hold).not.toBeNull();
  });

  test("releases once the resume time has passed", () => {
    const hold = findUsageLimitHold(
      [
        {
          role: "assistant",
          errorType: "rate_limit",
          limitResetAt: now - USAGE_LIMIT_QUEUE_RESUME_DELAY_MS,
        },
      ],
      now,
    );
    expect(hold).toBeNull();
  });

  test("does not hold when a later turn succeeded", () => {
    const hold = findUsageLimitHold(
      [
        { role: "assistant" },
        { role: "user" },
        {
          role: "assistant",
          errorType: "rate_limit",
          limitResetAt: now + HOUR_MS,
        },
      ],
      now,
    );
    expect(hold).toBeNull();
  });

  test("does not hold a limit with no reset time", () => {
    expect(
      findUsageLimitHold([{ role: "assistant", errorType: "rate_limit" }], now),
    ).toBeNull();
  });
});

async function fixture(options: {
  sandboxStatus: "active" | "closed";
  queuedModel: "claude:sonnet" | "codex:gpt-5.6";
  hitLimit: boolean;
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
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Ran once",
      status: "code_review" as const,
      repoId,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      sandboxId: "sbx-task",
      reviewTaskSandboxStatus: options.sandboxStatus,
    });
    if (options.hitLimit) {
      await ctx.db.insert("messages", {
        parentId: taskId,
        role: "user",
        content: "fix the header",
        timestamp: now - 2,
        model: "claude:sonnet" as const,
      });
      await ctx.db.insert("messages", {
        parentId: taskId,
        role: "assistant",
        content: "Error: You've hit your session limit · resets 4pm (UTC)",
        timestamp: now - 1,
        finishedAt: now - 1,
        errorType: "rate_limit" as const,
        limitResetAt: now + HOUR_MS,
      });
    }
    await ctx.db.insert("queuedMessages", {
      parentId: taskId,
      content: "and also rename the button",
      createdAt: now,
      order: now,
      userId,
      model: options.queuedModel,
    });
    return { taskId };
  });
  return { t, ...ids };
}

function queueLength(t: ReturnType<typeof convexTest>, taskId: Id<"agentTasks">) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", taskId))
      .collect();
    return rows.length;
  });
}

function scheduledResumes(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows.filter((row) => row.name.includes("drainQueueQuietly"));
  });
}

describe("a quiet drain", () => {
  // Keeps the scheduled sandbox start from firing after the test finishes.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "wakes a sleeping sandbox instead of starting the turn",
    async () => {
      const { t, taskId } = await fixture({
        sandboxStatus: "closed",
        queuedModel: "claude:sonnet",
        hitLimit: false,
      });

      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: taskId,
      });

      expect(await queueLength(t, taskId)).toBe(1);
      const task = await t.run((ctx) => ctx.db.get(taskId));
      expect(task?.reviewTaskSandboxStatus).toBe("starting");
    },
    TIMEOUT_MS,
  );

  test(
    "holds a same-provider message after a usage limit and books the resume",
    async () => {
      const { t, taskId } = await fixture({
        sandboxStatus: "closed",
        queuedModel: "claude:sonnet",
        hitLimit: true,
      });

      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: taskId,
      });

      expect(await queueLength(t, taskId)).toBe(1);
      // Held, so the sandbox is not woken just to sit idle until the reset.
      const task = await t.run((ctx) => ctx.db.get(taskId));
      expect(task?.reviewTaskSandboxStatus).toBe("closed");
      const resumes = await scheduledResumes(t);
      expect(resumes).toHaveLength(1);
      expect(resumes[0]?.scheduledTime).toBeGreaterThan(
        Date.now() + HOUR_MS,
      );
    },
    TIMEOUT_MS,
  );

  test(
    "does not hold a message moved to another provider",
    async () => {
      const { t, taskId } = await fixture({
        sandboxStatus: "closed",
        queuedModel: "codex:gpt-5.6",
        hitLimit: true,
      });

      await t.mutation(internal._queues.helpers.drainQueueQuietly, {
        parentId: taskId,
      });

      // Not held: it goes on to wake the sandbox so the message can send.
      const task = await t.run((ctx) => ctx.db.get(taskId));
      expect(task?.reviewTaskSandboxStatus).toBe("starting");
      expect(await scheduledResumes(t)).toHaveLength(0);
    },
    TIMEOUT_MS,
  );
});
