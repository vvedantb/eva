import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { taskBranchName } from "../_git/branchNames";
import {
  findLivePullRequestOnBranch,
  taskRelatedPrLinks,
} from "../_pullRequests/store";
import { siblingPrValidator } from "../prBody";
import { taskStatusValidator } from "../_validators/enums";
import {
  buildTraitsExecutionPayload,
  reasoningLevelValidator,
  runModeValidator,
} from "../validators";
import { resolveTaskWorkflowBaseBranch } from "./resolveBaseBranch";
import {
  buildImplementationPrompt,
  buildConflictResolutionPrompt,
} from "./prompts";
import { resolveMessageTokens } from "../_mentions/resolveMessageTokens";
import { listReadableSiblingRepos } from "../_githubRepos/sandboxRead";
import { childTaskProjectBlock } from "../_sessions/sessionPrompt";
import { buildLinkedReposSection } from "../prompts";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatCommentDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function userDisplayName(user: Doc<"users"> | null): string {
  if (!user) return "Reviewer";
  if (user.fullName?.trim()) return user.fullName.trim();
  const combined = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  if (combined) return combined;
  return user.email ?? "Reviewer";
}

async function getChangeRequestContents(
  ctx: QueryCtx,
  taskId: Id<"agentTasks">,
): Promise<string[]> {
  const comments = await ctx.db
    .query("taskComments")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  return comments
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => c.content);
}

async function listSessionRepos(
  ctx: QueryCtx,
  sessionId: Id<"sessions"> | undefined,
): Promise<Doc<"sessionRepos">[]> {
  if (sessionId === undefined) return [];
  return await ctx.db
    .query("sessionRepos")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
}

/** Fetches task and repo config to build the prompt and sandbox parameters for a run. */
export const getTaskData = internalQuery({
  args: {
    taskId: v.id("agentTasks"),
    repoId: v.id("githubRepos"),
    runId: v.id("agentRuns"),
    projectId: v.optional(v.id("projects")),
    ownedSessionId: v.optional(v.id("sessions")),
    branchName: v.optional(v.string()),
    mode: v.optional(runModeValidator),
  },
  returns: v.object({
    prompt: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    taskTitle: v.string(),
    taskDescription: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    traits: v.object({
      reasoningLevel: v.optional(reasoningLevelValidator),
      thinkingEnabled: v.optional(v.boolean()),
      use1mContext: v.optional(v.boolean()),
      fastMode: v.optional(v.boolean()),
    }),
    deploymentProjectName: v.optional(v.string()),
    rootDirectory: v.string(),
    devPort: v.optional(v.number()),
    devCommand: v.optional(v.string()),
    hasLinkedRepos: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const [task, repo, comments, successfulRuns, linkedRepoRows] = await Promise.all([
      ctx.db.get(args.taskId),
      ctx.db.get(args.repoId),
      ctx.db
        .query("taskComments")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
        .collect(),
      ctx.db
        .query("agentRuns")
        .withIndex("by_task_and_status", (q) =>
          q.eq("taskId", args.taskId).eq("status", "success"),
        )
        .collect(),
      listSessionRepos(ctx, args.ownedSessionId),
    ]);
    if (!task) throw new Error("Task not found");
    if (!repo) throw new Error("Repository not found");

    const resolveDescriptionForPrompt = async (
      text: string | undefined,
    ): Promise<string | undefined> => {
      const trimmed = text?.trim();
      if (!trimmed) return undefined;
      const { resolvedMessage, prefixBlock } = await resolveMessageTokens(
        ctx,
        trimmed,
        args.repoId,
      );
      if (prefixBlock) {
        return `${prefixBlock}\n\n${resolvedMessage}`;
      }
      return resolvedMessage;
    };

    let projectContext: { title: string; description?: string } | undefined;
    let projectBlock = "";
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (project) {
        projectContext = {
          title: project.title,
          description: await resolveDescriptionForPrompt(
            project.description ?? undefined,
          ),
        };
        projectBlock = await childTaskProjectBlock(ctx, project);
      }
    }
    const runNote = (await ctx.db.get(args.runId))?.note?.trim() ?? "";

    const resolvedTaskDescription = await resolveDescriptionForPrompt(
      task.description ?? undefined,
    );

    const latestSuccessfulRun = successfulRuns.reduce<Doc<"agentRuns"> | null>(
      (latest, run) => {
        if (run.startedAt === undefined) return latest;
        if (
          latest === null ||
          latest.startedAt === undefined ||
          run.startedAt > latest.startedAt
        ) {
          return run;
        }
        return latest;
      },
      null,
    );
    const latestSuccessStartedAt = latestSuccessfulRun?.startedAt;
    const previousRunSummary =
      latestSuccessfulRun?.resultSummary?.trim() || undefined;
    const relevantComments =
      latestSuccessStartedAt !== undefined
        ? comments.filter((c) => c.createdAt > latestSuccessStartedAt)
        : comments;

    const sortedComments = relevantComments.sort(
      (a, b) => a.createdAt - b.createdAt,
    );

    const uniqueAuthorIds = [
      ...new Set(
        sortedComments
          .map((c) => c.authorId)
          .filter((id): id is Id<"users"> => id !== undefined),
      ),
    ];
    const authors = await Promise.all(
      uniqueAuthorIds.map((id) => ctx.db.get(id)),
    );
    const authorNameById = new Map<string, string>();
    uniqueAuthorIds.forEach((id, index) => {
      authorNameById.set(id, userDisplayName(authors[index]));
    });

    const changeRequests = await Promise.all(
      sortedComments.map(async (c) => {
        const author = c.authorId
          ? (authorNameById.get(c.authorId) ?? "Reviewer")
          : "Reviewer";
        const resolved =
          (await resolveDescriptionForPrompt(c.content)) ?? c.content;
        return {
          commitText: resolved,
          promptText: `[${author} · ${formatCommentDate(c.createdAt)}] ${resolved}`,
        };
      }),
    );

    const branchName = args.branchName || taskBranchName(task);

    const rootDirectory = repo.rootDirectory ?? "";

    const readableRepos = await listReadableSiblingRepos(
      ctx.db,
      task.createdBy,
      repo._id,
    );

    const prompt =
      args.mode === "resolve_conflicts"
        ? buildConflictResolutionPrompt(
            branchName,
            resolveTaskWorkflowBaseBranch(task, repo),
            rootDirectory,
            repo.owner,
            repo.name,
            repo.systemPrompt,
          )
        : buildImplementationPrompt(
            {
              title: task.title,
              description: resolvedTaskDescription,
              taskNumber: task.taskNumber,
            },
            branchName,
            !args.projectId,
            rootDirectory,
            repo.owner,
            repo.name,
            changeRequests.length > 0 ? changeRequests : undefined,
            projectContext,
            repo.systemPrompt,
            previousRunSummary,
            readableRepos,
            repo.agentMemoryEnabled === true,
          ) +
          buildLinkedReposSection(
            { owner: repo.owner, name: repo.name, branchName },
            linkedRepoRows.map((row) => ({
              owner: row.owner,
              name: row.name,
              path: row.path,
              branchName: row.branchName,
              baseBranch: row.baseBranch,
            })),
            task.title.slice(0, 50).replace(/"/g, '\\"'),
          );

    return {
      prompt: [prompt, projectBlock, runNote]
        .filter((block) => block !== "")
        .join("\n\n"),
      repoOwner: repo.owner,
      repoName: repo.name,
      branchName,
      taskTitle: task.title,
      taskDescription: resolvedTaskDescription ?? task.description,
      attachmentStorageIds: task.attachmentStorageIds,
      traits: buildTraitsExecutionPayload(task.model, {
        effortLevel: task.reasoningLevel,
        thinkingEnabled: task.thinkingEnabled,
        use1mContext: task.use1mContext,
        fastMode: task.fastMode,
      }),
      deploymentProjectName: repo.deploymentProjectName,
      rootDirectory,
      devPort: repo.devPort,
      devCommand: repo.devCommand,
      hasLinkedRepos: linkedRepoRows.length > 0,
    };
  },
});

/** Fetches everything the manual Create PR action needs in one round-trip:
 * task/repo metadata for the GitHub call, the latest run to attach the
 * resulting URL to, and the change-request enrichment for the body. */
export const getTaskPrCreationData = internalQuery({
  args: {
    taskId: v.id("agentTasks"),
  },
  returns: v.object({
    repoId: v.id("githubRepos"),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.string(),
    taskTitle: v.string(),
    taskDescription: v.optional(v.string()),
    rootDirectory: v.string(),
    projectId: v.optional(v.id("projects")),
    isQuickTask: v.boolean(),
    taskStatus: taskStatusValidator,
    latestRunId: v.union(v.id("agentRuns"), v.null()),
    existingPrUrl: v.union(v.string(), v.null()),
    changeRequests: v.array(v.string()),
    relatedPrs: v.array(siblingPrValidator),
  }),
  handler: async (ctx, args) => {
    const [task, runs, changeRequests, relatedPrs] = await Promise.all([
      ctx.db.get(args.taskId),
      ctx.db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
        .collect(),
      getChangeRequestContents(ctx, args.taskId),
      taskRelatedPrLinks(ctx.db, args.taskId),
    ]);
    if (!task) throw new Error("Task not found");
    if (!task.repoId) throw new Error("Task has no repository");

    const repo = await ctx.db.get(task.repoId);
    if (!repo) throw new Error("Repository not found");

    const sortedRuns = runs.sort(
      (a, b) =>
        (b.startedAt ?? b._creationTime) - (a.startedAt ?? a._creationTime),
    );
    const latestRun = sortedRuns[0] ?? null;
    const branchName = taskBranchName(task);
    const livePr = await findLivePullRequestOnBranch(
      ctx.db,
      repo._id,
      branchName,
    );

    return {
      repoId: repo._id,
      installationId: repo.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
      branchName,
      baseBranch: resolveTaskWorkflowBaseBranch(task, repo),
      taskTitle: task.title,
      taskDescription: task.description,
      rootDirectory: repo.rootDirectory ?? "",
      projectId: task.projectId,
      isQuickTask: task.projectId === undefined,
      taskStatus: task.status,
      latestRunId: latestRun ? latestRun._id : null,
      existingPrUrl: livePr?.prUrl ?? null,
      changeRequests,
      relatedPrs,
    };
  },
});

/** Fetches task comments and a multi-repo task's linked PRs for the PR body. */
export const getPrEnrichmentData = internalQuery({
  args: {
    taskId: v.id("agentTasks"),
  },
  returns: v.object({
    changeRequests: v.array(v.string()),
    relatedPrs: v.array(siblingPrValidator),
  }),
  handler: async (ctx, args) => {
    const [changeRequests, relatedPrs] = await Promise.all([
      getChangeRequestContents(ctx, args.taskId),
      taskRelatedPrLinks(ctx.db, args.taskId),
    ]);
    return { changeRequests, relatedPrs };
  },
});
