import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  automationRunFields,
  automationFindingValidator,
  runStatusValidator,
  turnCheckpointArgs,
} from "../validators";
import { authQuery, authMutation, hasRepoAccess } from "../functions";
import {
  rejectSandboxCaller,
  requireSandboxCaller,
} from "../_auth/sandboxIdentity";
import { cancelTrackedWorkflow } from "../workflowManager";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import {
  gatherAccessibleRepos,
  resolveSandboxRepoId,
} from "../_githubRepos/helpers";
import { resolveAutomationDoc } from "./systemAutomations";

/** Loads a run and its automation, throwing unless the user can access the repo. */
async function loadRunWithAccess(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  runId: Id<"automationRuns">,
): Promise<{ run: Doc<"automationRuns">; automation: Doc<"automations"> }> {
  const run = await db.get(runId);
  if (!run) throw new Error("Run not found");
  const automation = await db.get(run.automationId);
  if (!automation) throw new Error("Automation not found");
  if (!(await hasRepoAccess(db, automation.repoId, userId))) {
    throw new Error("Not authorized");
  }
  return { run, automation };
}
import { taskCompleteEvent } from "../_taskWorkflow/events";
import {
  recordCompletionLog,
  sendCompletionEvent,
} from "../_taskWorkflow/helpers";
import { listAutomationsForRepo } from "./helpers";

/** Lists the most recent 50 runs for a given automation, newest first. */
export const listRuns = authQuery({
  args: { automationId: v.id("automations") },
  returns: v.array(
    v.object({
      _id: v.id("automationRuns"),
      _creationTime: v.number(),
      ...automationRunFields,
    }),
  ),
  handler: async (ctx, args) => {
    const automation = await ctx.db.get(args.automationId);
    if (
      !automation ||
      !(await hasRepoAccess(ctx.db, automation.repoId, ctx.userId))
    ) {
      return [];
    }
    return await ctx.db
      .query("automationRuns")
      .withIndex("by_automation", (q) =>
        q.eq("automationId", args.automationId),
      )
      .order("desc")
      .take(50);
  },
});

/** Marks an automation run as acknowledged by the user. */
export const acknowledgeRun = authMutation({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await loadRunWithAccess(ctx.db, ctx.userId, args.runId);
    await ctx.db.patch(args.runId, { acknowledged: true });
    return null;
  },
});

/** Counts automations whose latest run is unacknowledged and completed. */
async function countUnreadForAutomations(
  db: GenericDatabaseReader<DataModel>,
  automationIds: Array<Id<"automations">>,
): Promise<number> {
  const latestRuns = await Promise.all(
    automationIds.map((automationId) =>
      db
        .query("automationRuns")
        .withIndex("by_automation", (q) => q.eq("automationId", automationId))
        .order("desc")
        .first(),
    ),
  );

  let count = 0;
  for (const latestRun of latestRuns) {
    if (
      latestRun &&
      !latestRun.acknowledged &&
      (latestRun.status === "success" || latestRun.status === "error")
    ) {
      count++;
    }
  }
  return count;
}

/** Unread automation runs across every repo the user can see (rail badge). */
export const countUnreadAll = authQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const repos = await gatherAccessibleRepos(ctx.db, ctx.userId, false);
    const perRepo = await Promise.all(
      repos.map((repo) => listAutomationsForRepo(ctx.db, repo._id)),
    );
    // Shared monorepo automations surface into every child app, so dedupe
    // before counting or one unread run is counted once per app.
    const automationIds = new Set<Id<"automations">>();
    for (const automations of perRepo) {
      for (const automation of automations) automationIds.add(automation._id);
    }
    return await countUnreadForAutomations(ctx.db, [...automationIds]);
  },
});

/** Fetches repository data needed for an automation run. */
export const getAutomationData = internalQuery({
  args: { automationId: v.id("automations"), repoId: v.id("githubRepos") },
  returns: v.union(
    v.object({
      repoOwner: v.string(),
      repoName: v.string(),
      rootDirectory: v.string(),
      defaultBaseBranch: v.optional(v.string()),
      /** App row used for sandbox credentials (VERCEL_PROJECT_ID lives here). */
      sandboxRepoId: v.id("githubRepos"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.repoId);
    if (!repo) return null;
    return {
      repoOwner: repo.owner,
      repoName: repo.name,
      rootDirectory: repo.rootDirectory ?? "",
      defaultBaseBranch: repo.defaultBaseBranch,
      sandboxRepoId: await resolveSandboxRepoId(ctx.db, args.repoId),
    };
  },
});

/**
 * Returns a successful run's summary for emailing: its markdown content, finish
 * time, edition number (this automation's count of successful runs, this one
 * included), and the automation title used for the subject and heading. Returns
 * null if the run is not a completed success. Internal use only.
 */
export const getRunForEmail = internalQuery({
  args: { runId: v.id("automationRuns") },
  returns: v.union(
    v.object({
      content: v.string(),
      publishedAt: v.number(),
      runNumber: v.number(),
      automationTitle: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "success") return null;
    if (!run.resultSummary || !run.finishedAt) return null;
    const automation = await ctx.db.get(run.automationId);
    if (!automation) return null;
    const successfulRuns = await ctx.db
      .query("automationRuns")
      .withIndex("by_automation_and_status", (q) =>
        q.eq("automationId", automation._id).eq("status", "success"),
      )
      .collect();
    return {
      content: run.resultSummary,
      publishedAt: run.finishedAt,
      runNumber: successfulRuns.length,
      automationTitle: resolveAutomationDoc(automation).title,
    };
  },
});

/** Updates an automation run's status and optional metadata fields (sandbox, error, PR URL, etc). */
export const updateRunStatus = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    status: runStatusValidator,
    sandboxId: v.optional(v.string()),
    error: v.optional(v.string()),
    resultSummary: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    activityLog: v.optional(v.string()),
    findings: v.optional(v.array(automationFindingValidator)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: Partial<Doc<"automationRuns">> = { status: args.status };
    if (args.sandboxId !== undefined) patch.sandboxId = args.sandboxId;
    if (args.error !== undefined) patch.error = args.error;
    if (args.resultSummary !== undefined)
      patch.resultSummary = args.resultSummary;
    if (args.prUrl !== undefined) patch.prUrl = args.prUrl;
    if (args.activityLog !== undefined) patch.activityLog = args.activityLog;
    if (args.findings !== undefined) patch.findings = args.findings;
    if (args.status === "success" || args.status === "error") {
      patch.finishedAt = Date.now();
    }
    await ctx.db.patch(args.runId, patch);

    // When a run succeeds and the automation opts into email, broadcast its
    // result summary to all users with email notifications enabled.
    if (args.status === "success") {
      const run = await ctx.db.get(args.runId);
      const automation = run ? await ctx.db.get(run.automationId) : null;
      if (
        automation?.sendEmail === true &&
        automation.systemKey !== undefined
      ) {
        await ctx.scheduler.runAfter(
          0,
          internal.automationEmail.sendAutomationEmail,
          { runId: args.runId },
        );
      }
    }
    return null;
  },
});

/** Clears the active workflow reference from a completed or failed automation run. */
export const clearRunWorkflow = internalMutation({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { activeWorkflowId: undefined });
    return null;
  },
});

/** Cancels an active automation run, stopping the workflow and cleaning up streaming state. */
export const cancelRun = authMutation({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const { run } = await loadRunWithAccess(ctx.db, ctx.userId, args.runId);

    await cancelTrackedWorkflow(ctx, run.activeWorkflowId);

    await ctx.db.patch(args.runId, {
      status: "cancelled",
      finishedAt: Date.now(),
      activeWorkflowId: undefined,
    });

    const streamingEntityId = `automation-run-${String(args.runId)}`;
    const streaming = await ctx.db
      .query("streamingActivity")
      .withIndex("by_entity", (q) => q.eq("entityId", streamingEntityId))
      .first();
    if (streaming) await ctx.db.delete(streaming._id);

    return null;
  },
});

/** Receives sandbox completion callback and forwards the event to the active automation workflow. */
export const handleCompletion = authMutation({
  args: {
    automationRunId: v.id("automationRuns"),
    runId: v.optional(v.string()),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    rawResultEvent: v.optional(v.string()),
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSandboxCaller(ctx);
    const run = await ctx.db.get(args.automationRunId);
    if (!run || !run.activeWorkflowId) return null;
    if (!(await hasRepoAccess(ctx.db, run.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    await sendCompletionEvent(ctx, taskCompleteEvent, run.activeWorkflowId, {
      success: args.success,
      result: args.result,
      error: args.error,
      activityLog: args.activityLog,
    });

    const automation = await ctx.db.get(run.automationId);
    if (automation) {
      await recordCompletionLog(ctx, {
        entityType: "automation",
        entityId: String(args.automationRunId),
        entityTitle: resolveAutomationDoc(automation).title,
        repoId: run.repoId,
        rawResultEvent: args.rawResultEvent,
      });
    }

    return null;
  },
});
