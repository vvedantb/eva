import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { ensureWorkSession } from "../convex/_sessions/ownedSession";
import { modules } from "./_helpers/convexModules";

/**
 * Phase 2b step 1 (`_migrations/removeAgentRuns.ts`): every run row goes, and
 * a task's latest old run first becomes a closed task-mode turn, so a failed
 * project task stays held (the scheduler does not restart it) and still
 * shows as failed. A quick task whose chat moved on gets no turn.
 */

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|remove-agent-runs";

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
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
      title: "Flags",
      rawInput: "Flags",
      numId: 1,
    });
    const base = { repoId, createdAt: now, updatedAt: now, createdBy: userId };
    const projectTaskId = await ctx.db.insert("agentTasks", {
      ...base,
      projectId,
      taskNumber: 1,
      approvedAt: now,
      title: "Remove the flag",
      status: "todo",
      numId: 1,
    });
    const quickTaskId = await ctx.db.insert("agentTasks", {
      ...base,
      title: "Fix the footer",
      status: "todo",
      numId: 2,
    });
    // Each task ran once, before runs were chat turns, and failed.
    const runOf = async (taskId: Id<"agentTasks">) => {
      const task = await ctx.db.get(taskId);
      if (!task) throw new Error("task missing");
      const { session, mainChat } = await ensureWorkSession(ctx, {
        kind: "task",
        task,
      });
      const runId = await ctx.db.insert("agentRuns", {
        taskId,
        repoId,
        status: "error",
        logs: [],
        startedAt: now - 10_000,
        finishedAt: now - 9_000,
        error: "Tests failed",
      });
      const replyMessageId = await ctx.db.insert("messages", {
        parentId: mainChat._id,
        role: "assistant",
        content: "Error: Tests failed",
        timestamp: now - 10_000,
        finishedAt: now - 9_000,
        runId,
      });
      await ctx.db.patch(runId, { replyMessageId });
      await ctx.db.insert("agentRunActivityLogs", {
        runId,
        activityLog: "[]",
        type: "run",
        updatedAt: now,
      });
      await ctx.db.insert("pullRequests", {
        owner: { kind: "task", taskId, runId },
        repoId,
        prUrl: `https://github.com/vvedantb/eva/pull/${taskId}`,
        prNumber: 1,
        headBranch: `eva/task-${taskId}`,
        state: "open",
        primary: true,
        origin: "eva",
        createdAt: now,
        updatedAt: now,
      });
      return { session, mainChat };
    };
    await runOf(projectTaskId);
    // The quick task's chat moved on after its run: a later reply turn.
    const quick = await runOf(quickTaskId);
    await ctx.db.insert("turns", {
      entityId: quick.mainChat._id,
      sessionId: quick.session._id,
      streamingEntityId: String(quick.mainChat._id),
      state: "done",
      open: false,
      turnStartedAt: now - 1_000,
      finishedAt: now - 500,
      leaseExpiresAt: now,
      leaseGeneration: 1,
      model: "claude:opus",
      repoId,
    });
    return { userId, repoId, projectId, projectTaskId, quickTaskId };
  });
  return { t, ids, asUser: t.withIdentity({ subject: CLERK_ID }) };
}

describe("removing agentRuns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "deletes every run row, keeps a failed project task held, and clears run ids",
    async () => {
      const { t, ids, asUser } = await fixture();
      await t.mutation(internal._migrations.removeAgentRuns.removeAgentRuns, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const left = await t.run(async (ctx) => ({
        runs: await ctx.db.query("agentRuns").collect(),
        logs: await ctx.db.query("agentRunActivityLogs").collect(),
        taggedMessages: (await ctx.db.query("messages").collect()).filter(
          (row) => row.runId !== undefined,
        ),
        prsWithRunId: (await ctx.db.query("pullRequests").collect()).filter(
          (pr) => pr.owner.kind !== "session" && pr.owner.runId !== undefined,
        ).length,
        taskRunTurns: (await ctx.db.query("turns").collect()).filter(
          (turn) => turn.taskRun !== undefined,
        ),
      }));
      expect(left.runs).toEqual([]);
      expect(left.logs).toEqual([]);
      expect(left.taggedMessages).toEqual([]);
      expect(left.prsWithRunId).toBe(0);
      // Only the project task's run became a turn.
      expect(left.taskRunTurns.map((turn) => turn.state)).toEqual(["error"]);

      // The failed project task is still held and still shows as failed.
      const rows = await asUser.query(api.agentTasks.listByProject, {
        projectId: ids.projectId,
      });
      expect(rows.find((row) => row._id === ids.projectTaskId)?.facts?.halted).toBe(
        "failed",
      );
      await t.mutation(internal.buildWorkflow.scheduleReadyTasks, {
        projectId: ids.projectId,
      });
      const queued = await t.run((ctx) => ctx.db.query("queuedMessages").collect());
      expect(queued).toEqual([]);
      expect(
        await asUser.query(api.agentRuns.getTaskIdsWithLatestRunError, {
          repoId: ids.repoId,
          taskIds: [ids.projectTaskId, ids.quickTaskId],
        }),
      ).toEqual([ids.projectTaskId]);

      // Running it again changes nothing.
      await t.mutation(internal._migrations.removeAgentRuns.removeAgentRuns, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const again = await t.run(async (ctx) =>
        (await ctx.db.query("turns").collect()).filter(
          (turn) => turn.taskRun !== undefined,
        ),
      );
      expect(again).toHaveLength(1);
    },
    TIMEOUT_MS,
  );
});
