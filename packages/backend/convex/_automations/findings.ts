import { autoStartTaskRun } from "../_agentTasks/taskRunTurn";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { authMutation } from "../functions";
import { loadRunWithAccess } from "./helpers";
import { allocateNumId } from "../numId";
import { ensureSubscribed } from "../taskSubscribers";
import type { Doc, Id } from "../_generated/dataModel";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { createTaskRunSummary } from "../_agentTasks/runSummary";
import { chatSeedFields, ensureWorkSession } from "../_sessions/ownedSession";
import { normalizeAIModel } from "../validators";
import { storedComposerTraits } from "../_shared/composerTraits";

/**
 * Inserts a `todo` quick task on the automation's repo, as the automation's
 * findings and event triggers both do. The caller decides whether to start it.
 */
export async function insertAutomationTask(
  ctx: MutationCtx,
  params: {
    automation: Doc<"automations">;
    repo: Doc<"githubRepos">;
    userId: Id<"users">;
    title: string;
    description: string;
  },
): Promise<{ taskId: Id<"agentTasks">; numId: number }> {
  const { automation, repo, userId, title, description } = params;
  const now = Date.now();
  const numId = await allocateNumId(ctx.db, automation.repoId, "agentTasks");
  const taskId = await ctx.db.insert("agentTasks", {
    title,
    description,
    repoId: automation.repoId,
    status: "todo",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    baseBranch: repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
    numId,
  });
  await createTaskRunSummary(ctx, taskId, automation.repoId);
  // The automation's model goes on the task's chat; without one the chat
  // starts on the repo's defaults when first needed.
  const task = automation.model !== undefined ? await ctx.db.get(taskId) : null;
  if (task && automation.model !== undefined) {
    await ensureWorkSession(
      ctx,
      { kind: "task", task },
      chatSeedFields({
        model: normalizeAIModel(automation.model),
        traits: storedComposerTraits(null),
      }),
    );
  }
  await ensureSubscribed(ctx, taskId, userId);
  await ctx.scheduler.runAfter(0, internal.textGen.generateTaskTags, {
    taskId,
    title,
    description,
    existingTags: [],
  });
  return { taskId, numId };
}

/** Creates agent tasks from selected automation findings and optionally auto-starts them. */
export const createTasksFromFindings = authMutation({
  args: {
    runId: v.id("automationRuns"),
    findingIds: v.array(v.string()),
    autoRun: v.boolean(),
  },
  returns: v.array(v.id("agentTasks")),
  handler: async (ctx, args) => {
    const { run, automation } = await loadRunWithAccess(
      ctx.db,
      ctx.userId,
      args.runId,
    );
    if (!run.findings) throw new Error("Run has no findings");

    const repo = await ctx.db.get(automation.repoId);
    if (!repo) throw new Error("Repo not found");

    const selectedIds = new Set(args.findingIds);
    const updatedFindings = [...run.findings];
    const taskIds: Id<"agentTasks">[] = [];

    for (let i = 0; i < updatedFindings.length; i++) {
      const finding = updatedFindings[i];
      if (!selectedIds.has(finding.id) || finding.taskId) continue;

      const descriptionParts = [finding.description];
      if (finding.filePaths && finding.filePaths.length > 0) {
        descriptionParts.push(`\nFiles: ${finding.filePaths.join(", ")}`);
      }
      if (finding.suggestedFix) {
        descriptionParts.push(`\nSuggested fix: ${finding.suggestedFix}`);
      }

      const { taskId } = await insertAutomationTask(ctx, {
        automation,
        repo,
        userId: ctx.userId,
        title: finding.title,
        description: descriptionParts.join(""),
      });

      updatedFindings[i] = { ...finding, taskId };
      taskIds.push(taskId);
    }

    await ctx.db.patch(args.runId, { findings: updatedFindings });

    if (args.autoRun) {
      for (const taskId of taskIds) {
        await ctx.scheduler.runAfter(0, internal.automations.autoStartTask, {
          taskId,
          userId: ctx.userId,
        });
      }
    }

    return taskIds;
  },
});

/** Runs the task an auto-run automation finding created, unless it is running already. */
export const autoStartTask = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await autoStartTaskRun(ctx, args.taskId, args.userId);
    return null;
  },
});
