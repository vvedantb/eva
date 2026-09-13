import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";
import { evaluationReportFields, normalizeAIModel } from "./validators";
import { allocateNumId } from "./numId";
import { ensureSubscribed } from "./taskSubscribers";
import { workflow } from "./workflowManager";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { resolveTaskWorkflowBaseBranchForTask } from "./_taskWorkflow/resolveBaseBranch";
import { resolveCredentialSourceLabel } from "./_userProviderAccounts/credentialSource";
import {
  createTaskRunSummary,
  setTaskLastRunStartedAt,
} from "./_agentTasks/runSummary";

const reportValidator = v.object({
  _id: v.id("evaluationReports"),
  _creationTime: v.number(),
  ...evaluationReportFields,
});

/** Lists all evaluation reports for a document, sorted by most recent first. */
export const listByDoc = authQuery({
  args: { docId: v.id("docs") },
  returns: v.array(reportValidator),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || !(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId)))
      return [];
    const reports = await ctx.db
      .query("evaluationReports")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .collect();
    return reports.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Creates agent tasks from selected evaluation issues and optionally auto-starts them. */
export const createTasksFromIssues = authMutation({
  args: {
    reportId: v.id("evaluationReports"),
    issueIds: v.array(v.string()),
    autoRun: v.boolean(),
  },
  returns: v.array(v.id("agentTasks")),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");
    if (!(await hasRepoAccess(ctx.db, report.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    const doc = await ctx.db.get(report.docId);
    if (!doc) throw new Error("Document not found");

    const repo = await ctx.db.get(report.repoId);
    if (!repo) throw new Error("Repo not found");

    const selectedIds = new Set(args.issueIds);
    const updatedIssues = [...(report.issues ?? [])];
    const taskIds: Id<"agentTasks">[] = [];
    const now = Date.now();

    for (let i = 0; i < updatedIssues.length; i++) {
      const issue = updatedIssues[i];
      if (!selectedIds.has(issue.id) || issue.taskId) continue;

      const descriptionParts = [issue.description];
      if (issue.filePaths && issue.filePaths.length > 0) {
        descriptionParts.push(`\nFiles: ${issue.filePaths.join(", ")}`);
      }
      if (issue.suggestedFix) {
        descriptionParts.push(`\nSuggested fix: ${issue.suggestedFix}`);
      }

      const taskId = await ctx.db.insert("agentTasks", {
        title: issue.title,
        description: descriptionParts.join(""),
        repoId: report.repoId,
        status: "todo",
        createdAt: now,
        updatedAt: now,
        createdBy: ctx.userId,
        baseBranch: repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
        model: repo.defaultModel,
        numId: await allocateNumId(ctx.db, report.repoId, "agentTasks"),
      });
      await createTaskRunSummary(ctx, taskId, report.repoId);
      await ensureSubscribed(ctx, taskId, ctx.userId);

      updatedIssues[i] = { ...issue, taskId };
      taskIds.push(taskId);
    }

    await ctx.db.patch(args.reportId, { issues: updatedIssues });

    if (args.autoRun) {
      for (const taskId of taskIds) {
        await ctx.scheduler.runAfter(
          0,
          internal.evaluationReports.autoStartTask,
          { taskId, userId: ctx.userId },
        );
      }
    }

    return taskIds;
  },
});

/** Creates a run and starts the task execution workflow for an auto-run evaluation issue. */
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

    const existingRuns = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    if (
      existingRuns.some((r) => r.status === "queued" || r.status === "running")
    ) {
      return null;
    }

    const startedAt = Date.now();
    const runId = await ctx.db.insert("agentRuns", {
      taskId: args.taskId,
      status: "queued",
      logs: [],
      startedAt,
      credentialSourceLabel: await resolveCredentialSourceLabel(
        ctx.db,
        task.providerAccountId,
        task.createdBy,
      ),
      model: normalizeAIModel(task.model),
    });
    await setTaskLastRunStartedAt(ctx, args.taskId, task.repoId, startedAt);

    await ctx.db.patch(args.taskId, {
      status: "in_progress",
      updatedAt: Date.now(),
    });

    try {
      const workflowId = await workflow.start(
        ctx,
        internal.taskWorkflow.taskExecutionWorkflow,
        {
          runId,
          taskId: args.taskId,
          repoId: task.repoId,
          installationId: repo.installationId,
          baseBranch: await resolveTaskWorkflowBaseBranchForTask(
            ctx.db,
            task,
            repo,
          ),
          isFirstTaskOnBranch: true,
          model: task.model ?? repo.defaultModel,
          providerAccountId: task.providerAccountId,
          credentialOwnerUserId: task.createdBy,
          userId: args.userId,
        },
      );

      await ctx.db.patch(args.taskId, {
        activeWorkflowId: String(workflowId),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start workflow";
      await ctx.db.patch(runId, {
        status: "error",
        error: message,
        finishedAt: Date.now(),
        exitReason: "workflow_start_failed",
      });
      await ctx.db.patch(args.taskId, {
        status: "todo",
        activeWorkflowId: undefined,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});
