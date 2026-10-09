import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  authMutation,
  authQuery,
  hasRepoAccess,
} from "./functions";
import { findDocWithAccess } from "./_docs/access";
import { evaluationReportFields } from "./validators";
import { allocateNumId } from "./numId";
import { ensureSubscribed } from "./taskSubscribers";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { createTaskRunSummary } from "./_agentTasks/runSummary";

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
    if (!(await findDocWithAccess(ctx.db, args.docId, ctx.userId))) return [];
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
          internal.automations.autoStartTask,
          { taskId, userId: ctx.userId },
        );
      }
    }

    return taskIds;
  },
});
