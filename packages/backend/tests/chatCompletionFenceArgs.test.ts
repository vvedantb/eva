import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  acquireTurnLease,
  openTurn,
  settleAgentTurnCompletion,
} from "../convex/_chat/turnStore";

/**
 * Runs and one-shot agents run on durable turns: completions carry the lease
 * fence and a stale fence is dropped.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the workflow module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|fence-args";
const MODEL = "claude:sonnet";

const reply = {
  success: true,
  result: "done",
  error: null,
  activityLog: null,
};

async function createFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "fence-args-test",
      installationId: 1,
      connectedBy: userId,
    });
    const now = Date.now();
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Fence args",
      status: "code_review",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    return { taskId, repoId };
  });
  return { t, ...ids };
}

/**
 * A quick-task run's completion carries its lease. A superseded lease is
 * dropped before the run is marked finalizing, so an old callback cannot end
 * a newer run's turn.
 */
test(
  "a run completion from a superseded lease is ignored",
  async () => {
    const f = await createFixture();
    const taskId = f.taskId;
    const { runId, turnId } = await f.t.run(async (ctx) => {
      await ctx.db.patch(taskId, {
        run: { state: "running", workflowId: "run-workflow" },
      });
      const runId = await ctx.db.insert("agentRuns", {
        taskId,
        repoId: f.repoId,
        status: "running",
        logs: [],
        startedAt: Date.now(),
      });
      const turnId = await openTurn(ctx, {
        entityId: runId,
        streamingEntityId: `task-run-${runId}`,
        model: MODEL,
        repoId: f.repoId,
      });
      const turn = await ctx.db.get(turnId);
      if (turn) await acquireTurnLease(ctx, turn, "running");
      return { runId, turnId };
    });

    await expect(
      f.t
        .withIdentity({ subject: CLERK_ID })
        .mutation(api.taskWorkflow.handleCompletion, {
          taskId,
          runId,
          ...reply,
          turnId,
          leaseGeneration: 0,
        }),
    ).resolves.toBeNull();

    const after = await f.t.run(async (ctx) => ({
      run: await ctx.db.get(runId),
      turn: await ctx.db.get(turnId),
    }));
    expect(after.run?.finalizingAt).toBeUndefined();
    expect(after.turn?.state).toBe("running");
  },
  TIMEOUT_MS,
);

/** One-shot agents open their turn already leased and close it on completion. */
test(
  "a one-shot agent turn opens leased and closes on a current completion",
  async () => {
    const f = await createFixture();
    const docId = await f.t.run(async (ctx) =>
      ctx.db.insert("docs", {
        repoId: f.repoId,
        title: "Recap",
        content: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const lease = await f.t.mutation(internal.turns.openAgentTurnLease, {
      entityId: docId,
      streamingEntityId: `pr-recap:${docId}`,
      model: "haiku",
      sandboxId: "sandbox-1",
      repoId: f.repoId,
      workflowId: "recap-workflow",
    });
    expect(lease.leaseGeneration).toBe(1);
    const opened = await f.t.run(async (ctx) => ctx.db.get(lease.turnId));
    expect(opened?.state).toBe("running");
    expect(opened?.workflowId).toBe("recap-workflow");

    const settled = await f.t.run(async (ctx) => ({
      stale: await settleAgentTurnCompletion(ctx, {
        entityId: docId,
        turnId: lease.turnId,
        leaseGeneration: 0,
        success: true,
        error: null,
      }),
      current: await settleAgentTurnCompletion(ctx, {
        entityId: docId,
        turnId: lease.turnId,
        leaseGeneration: lease.leaseGeneration,
        success: true,
        error: null,
      }),
      turn: await ctx.db.get(lease.turnId),
    }));
    expect(settled.stale).toBe(false);
    expect(settled.current).toBe(true);
    expect(settled.turn?.state).toBe("done");
  },
  TIMEOUT_MS,
);
