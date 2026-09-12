import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { DEFAULT_AI_MODEL, normalizeAIModel } from "../validators";
import { authMutation, hasRepoAccess } from "../functions";
import { rejectSandboxCaller } from "../_auth/sandboxIdentity";
import { workflow } from "../workflowManager";
import { buildAutomationRunBranchName } from "./helpers";
import { resolveAutomationDoc } from "./systemAutomations";

/** True when the automation already has a queued or running execution. */
async function hasRunInFlight(
  ctx: MutationCtx,
  automationId: Doc<"automations">["_id"],
): Promise<boolean> {
  const lastRun = await ctx.db
    .query("automationRuns")
    .withIndex("by_automation", (q) => q.eq("automationId", automationId))
    .order("desc")
    .first();
  return (
    lastRun !== null &&
    (lastRun.status === "queued" || lastRun.status === "running")
  );
}

/**
 * Inserts a queued automation run and starts its execution workflow.
 * Shared by the cron triggers and the manual "run now" path — both enqueue an
 * identical run once their eligibility checks pass. The workflow never re-reads
 * the row, so this is where the system-automation catalog overlay is applied.
 */
async function startAutomationRun(
  ctx: MutationCtx,
  storedAutomation: Doc<"automations">,
  repo: Doc<"githubRepos">,
): Promise<void> {
  const automation = resolveAutomationDoc(storedAutomation);
  const runId = await ctx.db.insert("automationRuns", {
    automationId: automation._id,
    repoId: automation.repoId,
    status: "queued",
    startedAt: Date.now(),
    acknowledged: false,
  });

  const branchName = buildAutomationRunBranchName(automation._id, runId);

  const workflowId = await workflow.start(
    ctx,
    internal.automationWorkflow.automationExecutionWorkflow,
    {
      runId,
      automationId: automation._id,
      repoId: automation.repoId,
      installationId: repo.installationId,
      branchName,
      description: automation.description,
      title: automation.title,
      model: normalizeAIModel(
        automation.model ?? repo.defaultModel ?? DEFAULT_AI_MODEL,
      ),
      rootDirectory: repo.rootDirectory ?? "",
      userId: automation.createdBy,
      readOnly: automation.readOnly === true,
      actionsEnabled: automation.actionsEnabled === true,
    },
  );

  await ctx.db.patch(runId, {
    activeWorkflowId: String(workflowId),
  });
}

/** Called by the cron scheduler to trigger an automation run if eligible. */
export const triggerAutomation = internalMutation({
  args: { automationId: v.id("automations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const automation = await ctx.db.get(args.automationId);
    if (!automation || !automation.enabled) return null;

    const repo = await ctx.db.get(automation.repoId);
    if (!repo) return null;

    if (await hasRunInFlight(ctx, args.automationId)) return null;

    await startAutomationRun(ctx, automation, repo);

    return null;
  },
});

/** Frontend trigger to immediately run an automation outside its cron schedule. */
export const runNow = authMutation({
  args: { automationId: v.id("automations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const stored = await ctx.db.get(args.automationId);
    if (!stored) throw new Error("Automation not found");
    if (!(await hasRepoAccess(ctx.db, stored.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    // Resolved so the prompt guard sees the catalog definition, not the
    // placeholder stored on a system install.
    const automation = resolveAutomationDoc(stored);
    if (!automation.description) {
      throw new Error("Automation has no description/prompt configured");
    }

    const repo = await ctx.db.get(automation.repoId);
    if (!repo) throw new Error("Repo not found");

    if (await hasRunInFlight(ctx, args.automationId)) {
      throw new Error("A run is already in progress");
    }

    await startAutomationRun(ctx, automation, repo);

    return null;
  },
});
