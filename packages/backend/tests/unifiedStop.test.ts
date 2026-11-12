import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { SANDBOX_HELD_ERROR } from "../convex/_sessions/stop";

/**
 * The one Stop every surface calls (`_sessions/stop.ts`). These are the rules
 * the web, mobile and MCP Stops used to disagree on.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|stop-owner";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** A project with an active session, and a project task running in its own chat. */
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Billing revamp",
      phase: "in_progress",
      rawInput: "revamp billing",
      numId: 1,
      updatedAt: 0,
    });
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "project", projectId },
      repoId,
      userId,
      title: "Billing revamp",
      status: "active",
      sandboxId: "sbx_project",
    });
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Split invoices",
      status: "in_progress",
      numId: 2,
      repoId,
      projectId,
      createdAt: 0,
      updatedAt: 0,
      createdBy: userId,
    });
    const taskChatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Split invoices",
      number: 2,
      isMain: false,
      taskId,
    });
    const runId = await ctx.db.insert("agentRuns", {
      taskId,
      repoId,
      status: "running",
      logs: [],
      startedAt: Date.now(),
    });
    await ctx.db.patch(taskId, {
      run: { state: "running", workflowId: "wf_task_run", runId },
    });
    // A quick task that has never needed a session.
    const quickTaskId = await ctx.db.insert("agentTasks", {
      title: "Bump deps",
      status: "todo",
      numId: 3,
      repoId,
      createdAt: 0,
      updatedAt: 0,
      createdBy: userId,
    });
    return { projectId, sessionId, taskId, taskChatId, runId, quickTaskId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("stopChatTurn", () => {
  test(
    "a project task's chat Stop cancels the task's run (mobile used to leave it)",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.sessions.stopChatTurn, {
        target: { chatId: f.taskChatId },
      });
      const [task, run] = await f.t.run(async (ctx) => [
        await ctx.db.get(f.taskId),
        await ctx.db.get(f.runId),
      ]);
      expect(task?.run).toBeUndefined();
      expect(run?.status).toBe("cancelled");
    },
    TIMEOUT_MS,
  );
});

describe("stopWorkSandbox", () => {
  test(
    "refuses while a build holds the session, then stops once it is idle",
    async () => {
      const f = await fixture();
      // The task run is part of the build here; only the build holds it.
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.taskId, { run: undefined });
        await ctx.db.patch(f.projectId, {
          build: { state: "running", workflowId: "wf_build" },
        });
      });
      await expect(
        f.asUser.mutation(api.sessions.stopWorkSandbox, {
          target: { projectId: f.projectId },
        }),
      ).rejects.toThrow(SANDBOX_HELD_ERROR);
      const held = await f.t.run(async (ctx) => ctx.db.get(f.sessionId));
      expect(held?.status).toBe("active");

      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.projectId, { build: undefined });
      });
      expect(
        await f.asUser.mutation(api.sessions.stopWorkSandbox, {
          target: { projectId: f.projectId },
        }),
      ).toBe(f.sessionId);
      const stopped = await f.t.run(async (ctx) => ctx.db.get(f.sessionId));
      expect(stopped?.status).toBe("stopping");
    },
    TIMEOUT_MS,
  );

  test(
    "refuses while a task's run has its turn open on the session",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const repoId = (await ctx.db.get(f.sessionId))?.repoId;
        if (!repoId) throw new Error("fixture session missing");
        await ctx.db.insert("turns", {
          entityId: f.runId,
          sessionId: f.sessionId,
          streamingEntityId: String(f.runId),
          state: "running",
          open: true,
          turnStartedAt: Date.now(),
          leaseExpiresAt: Date.now() + 120_000,
          leaseGeneration: 1,
          model: "claude:sonnet",
          repoId,
          workflowId: "wf_task_run",
        });
      });
      await expect(
        f.asUser.mutation(api.sessions.stopWorkSandbox, {
          target: { taskId: f.taskId },
        }),
      ).rejects.toThrow(SANDBOX_HELD_ERROR);
    },
    TIMEOUT_MS,
  );

  test(
    "never creates a session (the web Stop used to)",
    async () => {
      const f = await fixture();
      expect(
        await f.asUser.mutation(api.sessions.stopWorkSandbox, {
          target: { taskId: f.quickTaskId },
        }),
      ).toBeNull();
      const sessions = await f.t.run(async (ctx) =>
        ctx.db
          .query("sessions")
          .filter((q) => q.eq(q.field("owner.kind"), "task"))
          .collect(),
      );
      expect(sessions).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
