import { v } from "convex/values";
import { isLivePrState } from "@eva/shared";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { allocateNumId, isEntityArchived } from "../numId";
import { maxTaskNumberOf } from "../_agentTasks/updateTask";
import { createTaskRunSummary } from "../_agentTasks/runSummary";
import { ensureSubscribed } from "../taskSubscribers";
import { extractPrNumber } from "../_github/prUrl";
import { resolveProjectBranchName } from "../_git/branchNames";
import {
  listOwnerPullRequests,
  recordPullRequest,
  syncOwnerPrSummary,
  type PrState,
} from "../_pullRequests/store";
import { syncProjectSessionBranch } from "../_sessions/ownedSession";

/**
 * Projects made before the coordinator kept their old project branch and
 * single project PR on the coordinator's session, and their tasks sat in
 * review with no PR of their own (their work went into the project PR). The
 * coordinator is read-only, so nobody could finish that work. Per live
 * project with an old PR:
 *
 * - PR open or draft: one new thread, "Earlier work (PR #n)", takes over the
 *   old branch (`agentTasks.branchName`) and the PR row (owner moves from the
 *   project to the task), so it can keep working and finishes when the PR
 *   merges. The old review tasks it absorbs are cancelled and listed in its
 *   description.
 * - PR merged: the old review tasks are done. PR closed: they are cancelled.
 * - Every case: the coordinator moves to a fresh project branch, off the old
 *   one (`branchVersion` + 1, `syncProjectSessionBranch` drops its VM).
 *
 * Draft and todo tasks stay as they are. Idempotent: a converted
 * project holds no project PR on its current branch, so a second run changes
 * nothing.
 *
 *   npx convex run --prod migrations:convertLegacyProjectThreads '{"dryRun": true}'
 *   npx convex run --prod migrations:convertLegacyProjectThreads
 */

const REVIEW_STATUSES = new Set(["code_review", "business_review"]);

const resultValidator = v.object({
  projectId: v.id("projects"),
  title: v.string(),
  prUrl: v.string(),
  prState: v.string(),
  threadTaskId: v.optional(v.id("agentTasks")),
  tasksDone: v.number(),
  tasksCancelled: v.number(),
  coordinatorBranchMoved: v.boolean(),
});

type ProjectResult = {
  projectId: Id<"projects">;
  title: string;
  prUrl: string;
  prState: string;
  threadTaskId?: Id<"agentTasks">;
  tasksDone: number;
  tasksCancelled: number;
  coordinatorBranchMoved: boolean;
};

export const convertLegacyProjectThreads = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.array(resultValidator),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun === true;
    const projects = (await ctx.db.query("projects").collect()).filter(
      (project) => !isEntityArchived(project),
    );
    const results: ProjectResult[] = [];
    for (const project of projects) {
      const result = await convertProject(ctx, project, dryRun);
      if (result) results.push(result);
    }
    console.log(
      `[migration] convertLegacyProjectThreads dryRun=${dryRun} projects=${results.length}`,
    );
    return results;
  },
});

/** The old PR a project still holds on its current branch, if any. */
async function legacyProjectPr(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<{
  prUrl: string;
  state: PrState;
  row: Doc<"pullRequests"> | undefined;
} | null> {
  const rows = await listOwnerPullRequests(ctx.db, {
    kind: "project",
    projectId: project._id,
  });
  const row = rows.find((r) => r.primary) ?? rows[0];
  if (row) return { prUrl: row.prUrl, state: row.state, row };
  // A project whose PR predates the `pullRequests` table: only its summary.
  if (project.prUrl === undefined) return null;
  return {
    prUrl: project.prUrl,
    state: project.prState ?? "open",
    row: undefined,
  };
}

async function convertProject(
  ctx: MutationCtx,
  project: Doc<"projects">,
  dryRun: boolean,
): Promise<ProjectResult | null> {
  const pr = await legacyProjectPr(ctx, project);
  if (!pr) return null;
  const oldBranch =
    pr.row?.headBranch ?? resolveProjectBranchName(project._id, project);
  const tasks = (
    await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect()
  ).filter((task) => !isEntityArchived(task));
  const reviewTasks = tasks.filter(
    (task) => REVIEW_STATUSES.has(task.status) && task.prUrl === undefined,
  );
  const live = isLivePrState(pr.state);
  // The coordinator still sits on the old branch: move it to a fresh one.
  const moveCoordinator =
    resolveProjectBranchName(project._id, project) === oldBranch;
  const result: ProjectResult = {
    projectId: project._id,
    title: project.title,
    prUrl: pr.prUrl,
    prState: pr.state,
    tasksDone: !live && pr.state === "merged" ? reviewTasks.length : 0,
    tasksCancelled: live || pr.state === "closed" ? reviewTasks.length : 0,
    coordinatorBranchMoved: moveCoordinator,
  };
  if (!live && reviewTasks.length === 0 && !moveCoordinator) return null;
  if (dryRun) return result;

  const now = Date.now();
  if (live) {
    result.threadTaskId = await createEarlierWorkThread(ctx, {
      project,
      tasks,
      reviewTasks,
      pr,
      oldBranch,
      now,
    });
  }
  const status = live || pr.state === "closed" ? "cancelled" : "done";
  for (const task of reviewTasks) {
    await ctx.db.patch(task._id, { status, updatedAt: now });
  }
  if (moveCoordinator) {
    await ctx.db.patch(project._id, {
      branchName: undefined,
      branchVersion: (project.branchVersion ?? 1) + 1,
      updatedAt: now,
    });
    await syncProjectSessionBranch(ctx, project._id);
  }
  return result;
}

/**
 * The thread that owns the old branch and PR from now on: approved, in review,
 * on the old branch, with the PR row moved from the project to it.
 */
async function createEarlierWorkThread(
  ctx: MutationCtx,
  params: {
    project: Doc<"projects">;
    tasks: Doc<"agentTasks">[];
    reviewTasks: Doc<"agentTasks">[];
    pr: { prUrl: string; state: PrState; row: Doc<"pullRequests"> | undefined };
    oldBranch: string;
    now: number;
  },
): Promise<Id<"agentTasks">> {
  const { project, tasks, reviewTasks, pr, oldBranch, now } = params;
  const repo = await ctx.db.get(project.repoId);
  const prNumber = extractPrNumber(pr.prUrl);
  const folded = reviewTasks
    .map(
      (task) =>
        `- ${task.numId !== undefined ? `#${task.numId} ` : ""}${task.title}`,
    )
    .join("\n");
  const taskId = await ctx.db.insert("agentTasks", {
    title: `Earlier work (PR #${prNumber ?? "?"})`,
    description: [
      `The work this project did before the coordinator, on branch \`${oldBranch}\` and PR ${pr.prUrl}. It finishes when that PR merges.`,
      folded ? `It covers these earlier tasks:\n${folded}` : undefined,
    ]
      .filter((part) => part !== undefined)
      .join("\n\n"),
    repoId: project.repoId,
    status: "code_review",
    createdAt: now,
    updatedAt: now,
    createdBy: project.userId,
    baseBranch: project.baseBranch,
    model: project.model ?? repo?.defaultModel,
    projectId: project._id,
    taskNumber: maxTaskNumberOf(tasks) + 1,
    approvedAt: now,
    branchName: oldBranch,
    numId: await allocateNumId(ctx.db, project.repoId, "agentTasks"),
  });
  await createTaskRunSummary(ctx, taskId, project.repoId);
  await ensureSubscribed(ctx, taskId, project.userId);

  if (pr.row) {
    // Webhooks now update the task: a merge marks it done.
    await ctx.db.patch(pr.row._id, {
      owner: { kind: "task", taskId },
      primary: true,
      updatedAt: now,
    });
    await syncOwnerPrSummary(ctx, { kind: "task", taskId });
  } else {
    await recordPullRequest(ctx, {
      owner: { kind: "task", taskId },
      repoId: project.repoId,
      prUrl: pr.prUrl,
      state: pr.state,
      primary: true,
      origin: "eva",
      headBranch: oldBranch,
      baseBranch: project.baseBranch,
      title: project.title,
    });
  }
  // The project holds no PR of its own any more.
  await ctx.db.patch(project._id, {
    prUrl: undefined,
    prState: undefined,
    prCount: 0,
    updatedAt: now,
  });
  return taskId;
}
