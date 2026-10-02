import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { DEFAULT_AI_MODEL, normalizeAIModel } from "../validators";
import { authMutation, hasRepoAccess } from "../functions";
import { workflow } from "../workflowManager";
import { buildAutomationRunBranchName } from "./helpers";
import { automationAction, resolveAutomationDoc } from "./systemAutomations";

/**
 * True when the automation already has an agent run executing. An event run
 * still waiting out its debounce is `queued` with no workflow yet, and does
 * not count: it has not claimed a sandbox.
 */
async function hasRunInFlight(
  ctx: MutationCtx,
  automationId: Id<"automations">,
): Promise<boolean> {
  const running = await ctx.db
    .query("automationRuns")
    .withIndex("by_automation_and_status", (q) =>
      q.eq("automationId", automationId).eq("status", "running"),
    )
    .first();
  if (running !== null) return true;
  const queued = await ctx.db
    .query("automationRuns")
    .withIndex("by_automation_and_status", (q) =>
      q.eq("automationId", automationId).eq("status", "queued"),
    )
    .collect();
  return queued.some((run) => run.activeWorkflowId !== undefined);
}

/**
 * Starts an automation's execution workflow, inserting a queued run unless an
 * event trigger already made one. Shared by the cron, "run now" and event
 * paths — all start an identical run once their eligibility checks pass. The
 * workflow never re-reads the row, so this is where the system-automation
 * catalog overlay is applied, and where an event's details join the prompt.
 */
async function startAutomationRun(
  ctx: MutationCtx,
  storedAutomation: Doc<"automations">,
  repo: Doc<"githubRepos">,
  event?: { runId: Id<"automationRuns">; context: string },
): Promise<void> {
  const automation = resolveAutomationDoc(storedAutomation);
  const runId =
    event?.runId ??
    (await ctx.db.insert("automationRuns", {
      automationId: automation._id,
      repoId: automation.repoId,
      status: "queued",
      startedAt: Date.now(),
      acknowledged: false,
    }));
  const description =
    event === undefined
      ? automation.description
      : `${automation.description}\n\n## Trigger event\n${event.context}`;

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
      description,
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
    if (automationAction(automation) !== "run") return null;

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
    if (automationAction(automation) !== "run") {
      throw new Error("This automation only runs when its event happens");
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

/**
 * Starts the agent run for an event-triggered `run` automation, once its
 * debounce has passed. The queued row already exists; a busy automation marks
 * it skipped rather than stacking a second sandbox.
 */
export const startEventRun = internalMutation({
  args: { runId: v.id("automationRuns"), context: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "queued") return null;
    const automation = await ctx.db.get(run.automationId);
    const repo = automation ? await ctx.db.get(automation.repoId) : null;
    if (!automation || !automation.enabled || !repo) {
      await ctx.db.patch(args.runId, {
        status: "error",
        error: "Automation is disabled or its repo is gone",
        finishedAt: Date.now(),
      });
      return null;
    }
    if (await hasRunInFlight(ctx, automation._id)) {
      await ctx.db.patch(args.runId, {
        status: "error",
        error: "Skipped: a run was already in progress",
        finishedAt: Date.now(),
      });
      return null;
    }
    await startAutomationRun(ctx, automation, repo, {
      runId: args.runId,
      context: args.context,
    });
    return null;
  },
});
