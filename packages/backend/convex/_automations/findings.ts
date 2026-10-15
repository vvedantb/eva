import { v } from "convex/values";
import { startTaskRun } from "../_taskWorkflow/startRun";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { authMutation, hasActiveRun } from "../functions";
import { loadRunWithAccess } from "./helpers";
import { allocateNumId } from "../numId";
import { ensureSubscribed } from "../taskSubscribers";
import type { Doc, Id } from "../_generated/dataModel";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { resolveTaskWorkflowBaseBranchForTask } from "../_taskWorkflow/resolveBaseBranch";
import { createTaskRunSummary } from "../_agentTasks/runSummary";

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
    model: automation.model ?? repo.defaultModel,
    numId,
  });
  await createTaskRunSummary(ctx, taskId, automation.repoId);
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

/** Creates a run and starts the task execution workflow for an auto-run automation finding. */
export const autoStartTask = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (!task.repoId) throw new Error("Task has no repository");

    const repo = await ctx.db.get(task.repoId);
    if (!repo) throw new Error("Repository not found");

    if (await hasActiveRun(ctx.db, args.taskId)) {
      return null;
    }

    // Swallow a start failure so the error run stays visible.
    try {
      await startTaskRun(ctx, {
        task,
        repo,
        userId: args.userId,
        baseBranch: await resolveTaskWorkflowBaseBranchForTask(
          ctx.db,
          task,
          repo,
        ),
        isFirstTaskOnBranch: true,
        clearPendingChangeRequest: false,
        rollbackStatus: "todo",
      });
    } catch (error) {
      console.error("[automations] autoStartTask failed to start workflow", error);
    }

    return null;
  },
});
