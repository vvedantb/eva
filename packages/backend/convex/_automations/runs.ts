import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import {
  automationRunFields,
  automationFindingValidator,
  findingTriageValidator,
  runStatusValidator,
} from "../validators";
import { authQuery, authMutation, hasRepoAccess } from "../functions";
import { isTerminalRunStatus } from "./runStatus";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import {
  gatherAccessibleRepos,
  resolveSandboxRepoId,
} from "../_githubRepos/helpers";
import { automationAction, resolveAutomationDoc } from "./systemAutomations";
import { queueRunEmail } from "./email";
import { createNotification } from "../notifications";
import { repoBasePath } from "@eva/shared";
import { automationsVisibleInRepo, loadRunWithAccess } from "./helpers";
import { stopAgentJob } from "../_agentJobs/slot";
import { syncCheckRunLater } from "./checkRun";
import { postRunCommentLater } from "./prComment";

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
    if (!automation) return [];
    if (!(await hasRepoAccess(ctx.db, automation.repoId, ctx.userId))) {
      throw new Error("Not authorized");
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
    // Reuse the repo rows already loaded: resolve each canonical id from them
    // (reading a parent only when it is not in the list), and read each repo's
    // automations once even when several child apps share one root.
    const loadedRepoIds = new Set(repos.map((repo) => repo._id));
    const rowsByRepo = new Map<
      Id<"githubRepos">,
      Promise<Array<Doc<"automations">>>
    >();
    const loadRepoRows = (repoId: Id<"githubRepos">) => {
      const cached = rowsByRepo.get(repoId);
      if (cached) return cached;
      const rows = ctx.db
        .query("automations")
        .withIndex("by_repo", (q) => q.eq("repoId", repoId))
        .collect();
      rowsByRepo.set(repoId, rows);
      return rows;
    };
    const perRepo = await Promise.all(
      repos.map(async (repo) => {
        const parentId = repo.parentRepoId;
        const canonicalId =
          parentId === undefined
            ? repo._id
            : loadedRepoIds.has(parentId) || (await ctx.db.get(parentId))
              ? parentId
              : repo._id;
        return automationsVisibleInRepo(repo._id, canonicalId, loadRepoRows);
      }),
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

/** Tells the automation's creator a run finished, with a link to its latest run. */
async function notifyRunFinished(
  ctx: MutationCtx,
  run: Doc<"automationRuns">,
  automation: Doc<"automations">,
): Promise<void> {
  const title = resolveAutomationDoc(automation).title;
  const repo = await ctx.db.get(automation.repoId);
  const failed = run.status === "error";
  await createNotification(ctx, {
    userId: automation.createdBy,
    title: failed ? `Automation failed: ${title}` : `Automation finished: ${title}`,
    message: failed ? run.error : run.resultSummary?.slice(0, 200),
    repoId: automation.repoId,
    href:
      repo && automation.numId !== undefined
        ? `${repoBasePath(repo)}/automations/${automation.numId}/latest`
        : undefined,
  });
}

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
    const current = await ctx.db.get(args.runId);
    if (!current) return null;
    // Terminal is final. A workflow finishing after the user cancelled must
    // not flip the run to success (and send its email) or error.
    if (isTerminalRunStatus(current.status)) {
      console.log(
        `[automations] updateRunStatus ignored runId=${args.runId} ${current.status} -> ${args.status}`,
      );
      return null;
    }
    const patch: Partial<Doc<"automationRuns">> = { status: args.status };
    if (args.sandboxId !== undefined) patch.sandboxId = args.sandboxId;
    if (args.error !== undefined) patch.error = args.error;
    if (args.resultSummary !== undefined)
      patch.resultSummary = args.resultSummary;
    if (args.prUrl !== undefined) patch.prUrl = args.prUrl;
    if (args.activityLog !== undefined) patch.activityLog = args.activityLog;
    if (args.findings !== undefined) patch.findings = args.findings;
    if (isTerminalRunStatus(args.status)) {
      patch.finishedAt = Date.now();
    }
    await ctx.db.patch(args.runId, patch);
    await syncCheckRunLater(ctx, current);
    if (args.status === "success") await postRunCommentLater(ctx, current);

    // Findings land unranked and possibly duplicating open work. Triage runs
    // out of band so the run finishes at the same speed either way.
    if (args.findings !== undefined && args.findings.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.automationTriage.triageFindings,
        { runId: args.runId },
      );
    }

    if (args.status === "success" || args.status === "error") {
      const run = await ctx.db.get(args.runId);
      const automation = run ? await ctx.db.get(run.automationId) : null;
      // Event presets settle through `settleEventRun`; this guards a preset
      // row reaching here by any other path.
      if (run && automation && automationAction(automation) === "run") {
        // When a run succeeds and the automation opts into email, draft (or,
        // with auto-send, send) its result summary for every email recipient.
        const emails = args.status === "success" && automation.sendEmail === true;
        if (emails) await queueRunEmail(ctx, run, automation);
        // A draft email already notifies its creator to review it.
        const draftNotifies = emails && automation.emailAutoSend !== true;
        if (!draftNotifies) await notifyRunFinished(ctx, run, automation);
      }
    }
    return null;
  },
});

/**
 * A run's repo and findings for the triage action. Null when the run is gone
 * or produced nothing to triage.
 */
export const getRunForTriage = internalQuery({
  args: { runId: v.id("automationRuns") },
  returns: v.union(
    v.null(),
    v.object({
      repoId: v.id("githubRepos"),
      findings: v.array(automationFindingValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || !run.findings || run.findings.length === 0) return null;
    return { repoId: run.repoId, findings: run.findings };
  },
});

/**
 * Stamps triage verdicts onto a run's findings. Re-reads the run rather than
 * taking the array the action saw, so a `taskId` linked while Jev was thinking
 * survives the write.
 */
export const setFindingsTriage = internalMutation({
  args: {
    runId: v.id("automationRuns"),
    triage: v.array(
      v.object({ id: v.string(), triage: findingTriageValidator }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || !run.findings) return null;
    const byId = new Map(args.triage.map((entry) => [entry.id, entry.triage]));
    await ctx.db.patch(args.runId, {
      findings: run.findings.map((finding) => {
        const triage = byId.get(finding.id);
        return triage ? { ...finding, triage } : finding;
      }),
    });
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

/** Cancels an active automation run: stops its job and marks it cancelled. */
export const cancelRun = authMutation({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { run } = await loadRunWithAccess(ctx.db, ctx.userId, args.runId);
    if (isTerminalRunStatus(run.status)) return null;

    await stopAgentJob(
      ctx,
      { kind: "automation", id: args.runId },
      run.activeWorkflowId,
      { state: "cancelled" },
    );
    await ctx.db.patch(args.runId, {
      status: "cancelled",
      finishedAt: Date.now(),
      activeWorkflowId: undefined,
    });
    await syncCheckRunLater(ctx, run);
    return null;
  },
});
