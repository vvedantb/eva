import { convexTest } from "convex-test";
import workflowTest from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { automationRunStreamingEntityId } from "../convex/_chat/agentStreamIds";
import { isTrackedWorkflowRunning, workflow } from "../convex/workflowManager";
import { modules } from "./_helpers/convexModules";

/**
 * The one-shot agent primitive (`_agentJobs/`, `agentJobs.ts`): one job per
 * owner slot, completions fenced by the turn lease and routed to the turn's
 * workflow, and every stop path (backstop, cancel) closes the turn, frees the
 * slot, clears the streaming rows and deletes the ephemeral sandbox.
 */

const TIMEOUT_MS = 30_000;
const OWNER = "clerk|agent-jobs-owner";
const STRANGER = "clerk|agent-jobs-stranger";

const reply = {
  success: true,
  result: "done",
  error: null,
  activityLog: null,
};

beforeEach(() => {
  // Hold every workflow step and scheduled job: these tests read what the
  // mutations wrote and scheduled, not what a background run does later.
  vi.useFakeTimers();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function createFixture() {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: OWNER });
    await ctx.db.insert("users", { clerkId: STRANGER });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const docId = await ctx.db.insert("docs", {
      repoId,
      title: "Spec",
      content: "",
      createdAt: 0,
      updatedAt: 0,
    });
    const automationId = await ctx.db.insert("automations", {
      repoId,
      title: "Nightly audit",
      description: "Audit the repo",
      cronSchedule: "",
      enabled: true,
      sendEmail: false,
      createdBy: userId,
      createdAt: 0,
      updatedAt: 0,
    });
    const runId = await ctx.db.insert("automationRuns", {
      automationId,
      repoId,
      status: "running",
      startedAt: 0,
      acknowledged: false,
    });
    return { userId, repoId, docId, runId };
  });
  const scheduled = () =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map(
        (job) => ({ name: job.name, args: job.args[0] }),
      ),
    );
  const streamingRows = (entityId: string) =>
    t.run(async (ctx) =>
      ctx.db
        .query("streamingActivity")
        .withIndex("by_entity", (q) => q.eq("entityId", entityId))
        .collect(),
    );
  const addStreamingRow = (entityId: string) =>
    t.run(async (ctx) => {
      await ctx.db.insert("streamingActivity", {
        entityId,
        currentActivity: "Working",
      });
    });
  const openTurn = (
    entityId: Id<"docs"> | Id<"automationRuns">,
    streamingEntityId: string,
    sandboxId: string,
    workflowId: string,
  ) =>
    t.mutation(internal.turns.openAgentTurnLease, {
      entityId,
      streamingEntityId,
      sandboxId,
      repoId: ids.repoId,
      workflowId,
    });
  const owner = t.withIdentity({ subject: OWNER });
  /** Starts test generation (a real job) and returns its workflow id. */
  const startTestGen = async () => {
    await owner.mutation(api.testGenWorkflow.startTestGen, {
      docId: ids.docId,
    });
    const doc = await t.run(async (ctx) => ctx.db.get(ids.docId));
    if (doc?.activeWorkflowId === undefined) {
      throw new Error("Test generation did not start");
    }
    return doc.activeWorkflowId;
  };
  return {
    t,
    ...ids,
    owner,
    startTestGen,
    stranger: t.withIdentity({ subject: STRANGER }),
    scheduled,
    streamingRows,
    addStreamingRow,
    openTurn,
  };
}

describe("startAgentJob", () => {
  test(
    "takes a free slot, schedules the backstop and refuses a busy slot",
    async () => {
      const f = await createFixture();
      // A slot left by a workflow the component no longer knows reads free.
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.docId, { activeWorkflowId: "ended-workflow" });
      });

      const workflowId = await f.startTestGen();
      expect(workflowId).not.toBe("ended-workflow");
      expect(await f.scheduled()).toContainEqual({
        name: "agentJobs:handleStale",
        args: { ownerId: f.docId, workflowId },
      });

      await expect(
        f.owner.mutation(api.testGenWorkflow.startTestGen, { docId: f.docId }),
      ).rejects.toThrow("Another document task is still running");
      const after = await f.t.run(async (ctx) => ctx.db.get(f.docId));
      expect(after?.activeWorkflowId).toBe(workflowId);
    },
    TIMEOUT_MS,
  );
});

describe("agentJobs:handleCompletion", () => {
  test(
    "refuses a caller without repo access",
    async () => {
      const f = await createFixture();
      const sendEvent = vi.spyOn(workflow, "sendEvent");
      const lease = await f.openTurn(f.docId, String(f.docId), "sbx", "wf-1");

      await expect(
        f.stranger.mutation(api.agentJobs.handleCompletion, {
          entityId: f.docId,
          ...lease,
          ...reply,
        }),
      ).rejects.toThrow("Not authorized");
      const turn = await f.t.run(async (ctx) => ctx.db.get(lease.turnId));
      expect(turn?.open).toBe(true);
      expect(sendEvent).not.toHaveBeenCalled();
    },
    TIMEOUT_MS,
  );

  test(
    "drops a stale lease or a superseded turn",
    async () => {
      const f = await createFixture();
      const sendEvent = vi.spyOn(workflow, "sendEvent");
      const old = await f.openTurn(f.docId, String(f.docId), "sbx", "wf-old");
      // A newer job opens its own turn, which supersedes the old one.
      const current = await f.openTurn(
        f.docId,
        String(f.docId),
        "sbx",
        "wf-new",
      );

      await f.owner.mutation(api.agentJobs.handleCompletion, {
        entityId: f.docId,
        turnId: current.turnId,
        leaseGeneration: current.leaseGeneration - 1,
        ...reply,
      });
      await f.owner.mutation(api.agentJobs.handleCompletion, {
        entityId: f.docId,
        ...old,
        ...reply,
      });

      const turn = await f.t.run(async (ctx) => ctx.db.get(current.turnId));
      expect(turn?.open).toBe(true);
      expect(sendEvent).not.toHaveBeenCalled();
    },
    TIMEOUT_MS,
  );

  test(
    "a current completion settles the turn and wakes its own workflow",
    async () => {
      const f = await createFixture();
      const sendEvent = vi.spyOn(workflow, "sendEvent");
      const workflowId = await f.startTestGen();
      const lease = await f.openTurn(
        f.docId,
        String(f.docId),
        "sbx",
        workflowId,
      );
      // The owner's slot names another workflow: the event must still go to
      // the one bound to the turn.
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.docId, { activeWorkflowId: "wf-slot" });
      });
      await f.addStreamingRow(String(f.docId));

      await f.owner.mutation(api.agentJobs.handleCompletion, {
        entityId: f.docId,
        ...lease,
        ...reply,
      });

      const turn = await f.t.run(async (ctx) => ctx.db.get(lease.turnId));
      expect(turn?.open).toBe(false);
      expect(turn?.state).toBe("done");
      expect(await f.streamingRows(String(f.docId))).toHaveLength(0);
      expect(sendEvent).toHaveBeenCalledTimes(1);
      expect(sendEvent.mock.calls[0]?.[1]).toMatchObject({
        name: "agentJobComplete",
        workflowId,
        value: reply,
      });
    },
    TIMEOUT_MS,
  );
});

describe("agentJobs.handleStale backstop", () => {
  test(
    "tears down a stale doc job",
    async () => {
      const f = await createFixture();
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.docId, {
          activeWorkflowId: "wf-doc",
          testGenStatus: "running",
        });
      });
      const lease = await f.openTurn(
        f.docId,
        String(f.docId),
        "sbx-doc",
        "wf-doc",
      );
      await f.addStreamingRow(String(f.docId));

      // A backstop for an earlier job leaves the current one alone.
      await f.t.mutation(internal.agentJobs.handleStale, {
        ownerId: f.docId,
        workflowId: "wf-earlier",
      });
      expect(
        (await f.t.run(async (ctx) => ctx.db.get(lease.turnId)))?.open,
      ).toBe(true);

      await f.t.mutation(internal.agentJobs.handleStale, {
        ownerId: f.docId,
        workflowId: "wf-doc",
      });

      const { doc, turn } = await f.t.run(async (ctx) => ({
        doc: await ctx.db.get(f.docId),
        turn: await ctx.db.get(lease.turnId),
      }));
      expect(turn?.open).toBe(false);
      expect(turn?.state).toBe("error");
      expect(doc?.activeWorkflowId).toBeUndefined();
      expect(doc?.testGenStatus).toBe("error");
      expect(await f.streamingRows(String(f.docId))).toHaveLength(0);
      expect(await f.scheduled()).toContainEqual({
        name: "sandbox:deleteSandbox",
        args: { sandboxId: "sbx-doc", repoId: f.repoId },
      });
    },
    TIMEOUT_MS,
  );

  test(
    "tears down a stale automation run",
    async () => {
      const f = await createFixture();
      const streamingEntityId = automationRunStreamingEntityId(f.runId);
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.runId, {
          activeWorkflowId: "wf-run",
          sandboxId: "sbx-run",
        });
      });
      const lease = await f.openTurn(
        f.runId,
        streamingEntityId,
        "sbx-run",
        "wf-run",
      );
      await f.addStreamingRow(streamingEntityId);

      await f.t.mutation(internal.agentJobs.handleStale, {
        ownerId: f.runId,
        workflowId: "wf-run",
      });

      const { run, turn } = await f.t.run(async (ctx) => ({
        run: await ctx.db.get(f.runId),
        turn: await ctx.db.get(lease.turnId),
      }));
      expect(turn?.open).toBe(false);
      expect(turn?.state).toBe("error");
      expect(run?.status).toBe("error");
      expect(run?.activeWorkflowId).toBeUndefined();
      expect(await f.streamingRows(streamingEntityId)).toHaveLength(0);
      expect(await f.scheduled()).toContainEqual({
        name: "sandbox:deleteSandbox",
        args: { sandboxId: "sbx-run", repoId: f.repoId },
      });
    },
    TIMEOUT_MS,
  );
});

describe("stopAgentJob", () => {
  test(
    "cancelling test generation stops the workflow and tears the job down",
    async () => {
      const f = await createFixture();
      const workflowId = await f.startTestGen();
      // A workflow step (`setRunning`) sets this; the held timers never run it.
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.docId, { testGenStatus: "running" });
      });
      const lease = await f.openTurn(
        f.docId,
        String(f.docId),
        "sbx-gen",
        workflowId,
      );
      await f.addStreamingRow(String(f.docId));

      await f.owner.mutation(api.testGenWorkflow.cancelTestGen, {
        docId: f.docId,
      });

      const { doc, turn, running } = await f.t.run(async (ctx) => ({
        doc: await ctx.db.get(f.docId),
        turn: await ctx.db.get(lease.turnId),
        running: await isTrackedWorkflowRunning(ctx, workflowId),
      }));
      expect(running).toBe(false);
      expect(turn?.open).toBe(false);
      expect(turn?.state).toBe("cancelled");
      expect(doc?.activeWorkflowId).toBeUndefined();
      expect(doc?.testGenStatus).toBeUndefined();
      expect(await f.streamingRows(String(f.docId))).toHaveLength(0);
      expect(await f.scheduled()).toContainEqual({
        name: "sandbox:deleteSandbox",
        args: { sandboxId: "sbx-gen", repoId: f.repoId },
      });
    },
    TIMEOUT_MS,
  );
});
