import { v, type Infer } from "convex/values";
import type { runModeValidator } from "../validators";
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
import { resolveTaskWorkflowBaseBranch } from "./resolveBaseBranch";
import {
  buildImplementationPrompt,
  buildConflictResolutionPrompt,
} from "./prompts";
import { resolveMessageTokens } from "../_mentions/resolveMessageTokens";
import { listReadableSiblingRepos } from "../_githubRepos/sandboxRead";
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

async function resolveTextForPrompt(
  ctx: QueryCtx,
  text: string | undefined,
  repoId: Id<"githubRepos">,
): Promise<string | undefined> {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  const { resolvedMessage, prefixBlock } = await resolveMessageTokens(
    ctx,
    trimmed,
    repoId,
  );
  return prefixBlock ? `${prefixBlock}\n\n${resolvedMessage}` : resolvedMessage;
}

/**
 * The agent prompt for a task run: the implementation steps with the
 * reviewer comments added after `commentsSince`, or the merge-conflict
 * steps. Shared by a project task's run (`getTaskData`) and a quick task's
 * task-mode chat turn (`_agentTasks/taskRunTurn.ts`), so both get the same
 * instructions.
 */
export async function buildTaskRunPrompt(
  ctx: QueryCtx,
  p: {
    task: Doc<"agentTasks">;
    repo: Doc<"githubRepos">;
    mode: Infer<typeof runModeValidator>;
    branchName: string;
    commentsSince: number | undefined;
    previousRunSummary?: string;
    projectContext?: { title: string; description?: string };
    linkedRepoRows: ReadonlyArray<Doc<"sessionRepos">>;
  },
): Promise<{ prompt: string; resolvedTaskDescription: string | undefined }> {
  const { task, repo, branchName } = p;
  const rootDirectory = repo.rootDirectory ?? "";
  const resolvedTaskDescription = await resolveTextForPrompt(
    ctx,
    task.description ?? undefined,
    repo._id,
  );
  if (p.mode === "resolve_conflicts") {
    return {
      prompt: buildConflictResolutionPrompt(
        branchName,
        resolveTaskWorkflowBaseBranch(task, repo),
        rootDirectory,
        repo.owner,
        repo.name,
        repo.systemPrompt,
      ),
      resolvedTaskDescription,
    };
  }
  const comments = await ctx.db
    .query("taskComments")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  const commentsSince = p.commentsSince;
  const sortedComments = comments
    .filter((c) => commentsSince === undefined || c.createdAt > commentsSince)
    .sort((a, b) => a.createdAt - b.createdAt);

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
        (await resolveTextForPrompt(ctx, c.content, repo._id)) ?? c.content;
      return {
        commitText: resolved,
        promptText: `[${author} · ${formatCommentDate(c.createdAt)}] ${resolved}`,
      };
    }),
  );

  const readableRepos = await listReadableSiblingRepos(
    ctx.db,
    task.createdBy,
    repo._id,
  );
  const prompt =
    buildImplementationPrompt(
      {
        title: task.title,
        description: resolvedTaskDescription,
        taskNumber: task.taskNumber,
      },
      branchName,
      task.projectId === undefined,
      rootDirectory,
      repo.owner,
      repo.name,
      changeRequests.length > 0 ? changeRequests : undefined,
      p.projectContext,
      repo.systemPrompt,
      p.previousRunSummary,
      readableRepos,
      repo.agentMemoryEnabled === true,
    ) +
    buildLinkedReposSection(
      { owner: repo.owner, name: repo.name, branchName },
      p.linkedRepoRows.map((row) => ({
        owner: row.owner,
        name: row.name,
        path: row.path,
        branchName: row.branchName,
        baseBranch: row.baseBranch,
      })),
      task.title.slice(0, 50).replace(/"/g, '\\"'),
    );
  return { prompt, resolvedTaskDescription };
}

/** Fetches everything the manual Create PR action needs in one round-trip:
 * task/repo metadata for the GitHub call and the change-request enrichment
 * for the body. */
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
    existingPrUrl: v.union(v.string(), v.null()),
    changeRequests: v.array(v.string()),
    relatedPrs: v.array(siblingPrValidator),
  }),
  handler: async (ctx, args) => {
    const [task, changeRequests, relatedPrs] = await Promise.all([
      ctx.db.get(args.taskId),
      getChangeRequestContents(ctx, args.taskId),
      taskRelatedPrLinks(ctx.db, args.taskId),
    ]);
    if (!task) throw new Error("Task not found");
    if (!task.repoId) throw new Error("Task has no repository");

    const repo = await ctx.db.get(task.repoId);
    if (!repo) throw new Error("Repository not found");

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
