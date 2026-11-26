import { convexTest } from "convex-test";
import { expect, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  acquireTurnLease,
  openTurn,
  settleAgentTurnCompletion,
} from "../convex/_chat/turnStore";
import { modules } from "./_helpers/convexModules";

/**
 * Runs and one-shot agents run on durable turns: completions carry the lease
 * fence and a stale fence is dropped.
 */


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
    expect(settled.stale).toBeNull();
    expect(settled.current?.workflowId).toBe("recap-workflow");
    expect(settled.turn?.state).toBe("done");
  },
  TIMEOUT_MS,
);
