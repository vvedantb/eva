import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { SANDBOX_HELD_ERROR } from "../convex/_sessions/stop";
import { modules } from "./_helpers/convexModules";

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|stop-owner";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

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
    const quickTaskId = await ctx.db.insert("agentTasks", {
      title: "Bump deps",
      status: "todo",
      numId: 3,
      repoId,
      createdAt: 0,
      updatedAt: 0,
      createdBy: userId,
    });
    return {
      userId,
      projectId,
      sessionId,
      taskId,
      runId,
      quickTaskId,
    };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("stopWorkSandbox", () => {
  test(
    "refuses while a task's run has its turn open on the session",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const repoId = (await ctx.db.get(f.sessionId))?.repoId;
        if (!repoId) throw new Error("fixture session missing");
        const taskSessionId = await ctx.db.insert("sessions", {
          owner: { kind: "task", taskId: f.taskId },
          repoId,
          userId: f.userId,
          title: "Split invoices",
          status: "active",
          sandboxId: "sbx_task",
        });
        await ctx.db.insert("turns", {
          entityId: f.runId,
          sessionId: taskSessionId,
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
