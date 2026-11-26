import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { authQuery, hasRepoAccess } from "../functions";
import { prStateValidator, sessionRepoFields } from "../validators";
import { resolveSessionBaseBranch } from "./baseBranch";
import {
  linkedRepoDir,
  PRIMARY_REPO_DIR,
} from "../_sandbox_runtime/workspaceLayout";
import {
  findPrimaryPullRequest,
  listOwnerPullRequests,
  sessionRepoPullRequest,
} from "../_pullRequests/store";
import { sessionOwnerTaskId } from "./owner";
import { buildSessionBranchName } from "../_git/branchNames";

/**
 * The repos checked out in one session's sandbox: the primary (`sessions.repoId`,
 * always at `/tmp/repo`) plus every `sessionRepos` row cloned beside it under
 * `/tmp/workspace`.
 */

/**
 * Inserts the session's linked repos: one `sessionRepos` row each, checked
 * out on the session's own branch name off its own default base, and sets
 * `linkedRepoCount`. The rows are the sandbox's clone list, so they must exist
 * before the sandbox starts. The one insert for a multi-repo session
 * (`createSession`) and a multi-repo task's session (`insertWorkSession`).
 */
export async function insertSessionRepos(
  ctx: MutationCtx,
  session: { sessionId: Id<"sessions">; branchName: string },
  linkedRepos: readonly Doc<"githubRepos">[],
  installDependencies: boolean,
): Promise<void> {
  if (linkedRepos.length === 0) return;
  for (const linkedRepo of linkedRepos) {
    await ctx.db.insert("sessionRepos", {
      sessionId: session.sessionId,
      repoId: linkedRepo._id,
      owner: linkedRepo.owner,
      name: linkedRepo.name,
      installationId: linkedRepo.installationId,
      path: linkedRepoDir(linkedRepo.name),
      branchName: session.branchName,
      baseBranch: resolveSessionBaseBranch(
        { baseBranch: undefined },
        linkedRepo,
      ),
      installDependencies,
      ...(linkedRepo.devPort !== undefined
        ? { devPort: linkedRepo.devPort }
        : {}),
      ...(linkedRepo.devCommand !== undefined
        ? { devCommand: linkedRepo.devCommand }
        : {}),
    });
  }
  await ctx.db.patch(session.sessionId, {
    linkedRepoCount: linkedRepos.length,
  });
}

/** Full `sessionRepos` document, for internal callers. */
export const sessionRepoValidator = v.object({
  _id: v.id("sessionRepos"),
  _creationTime: v.number(),
  ...sessionRepoFields,
});

/**
 * One checked-out repo, primary or linked. A single shape for both so the UI
 * renders one list; the fields only a clone has (`installDependencies`,
 * `clonedAt`, `devPort`, `sessionRepoId`) are absent on the primary row.
 */
const sessionRepoListItemValidator = v.object({
  kind: v.union(v.literal("primary"), v.literal("linked")),
  /** The `sessionRepos` row this came from. Absent on the primary. */
  sessionRepoId: v.optional(v.id("sessionRepos")),
  repoId: v.id("githubRepos"),
  owner: v.string(),
  name: v.string(),
  rootDirectory: v.optional(v.string()),
  label: v.optional(v.string()),
  logoUrl: v.optional(v.union(v.string(), v.null())),
  path: v.string(),
  branchName: v.string(),
  baseBranch: v.string(),
  prUrl: v.optional(v.string()),
  prState: v.optional(prStateValidator),
  installDependencies: v.optional(v.boolean()),
  clonedAt: v.optional(v.number()),
  devPort: v.optional(v.number()),
});

/** Lists the session's repos, primary first, then its linked clones. */
export const listRepos = authQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.array(sessionRepoListItemValidator),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return [];
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return [];

    const repo = await ctx.db.get(session.repoId);
    if (!repo) return [];
    const branchName = session.branchName ?? buildSessionBranchName(session._id);
    const prs = await listOwnerPullRequests(ctx.db, {
      kind: "session",
      sessionId: session._id,
    });
    // A task's session: the task owns the primary repo's PR.
    const ownerTaskId = sessionOwnerTaskId(session);
    const primaryPr =
      ownerTaskId === undefined
        ? sessionRepoPullRequest(prs, undefined)
        : await findPrimaryPullRequest(ctx.db, {
            kind: "task",
            taskId: ownerTaskId,
          });
    const primary = {
      kind: "primary" as const,
      repoId: repo._id,
      owner: repo.owner,
      name: repo.name,
      rootDirectory: repo.rootDirectory,
      label: repo.label,
      logoUrl: repo.logoStorageId
        ? await ctx.storage.getUrl(repo.logoStorageId)
        : undefined,
      path: PRIMARY_REPO_DIR,
      branchName,
      baseBranch: resolveSessionBaseBranch(session, repo),
      prUrl: primaryPr?.prUrl,
      prState: primaryPr?.state,
    };

    const links = await ctx.db
      .query("sessionRepos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const linked = await Promise.all(
      links.map(async (link) => {
        // The repo row may have been deleted under the session; the link still
        // knows its own owner/name, so only presentation fields are lost.
        const linkedRepo = await ctx.db.get(link.repoId);
        const linkedPr = sessionRepoPullRequest(prs, link._id);
        return {
          kind: "linked" as const,
          sessionRepoId: link._id,
          repoId: link.repoId,
          owner: link.owner,
          name: link.name,
          rootDirectory: linkedRepo?.rootDirectory,
          label: linkedRepo?.label,
          logoUrl: linkedRepo?.logoStorageId
            ? await ctx.storage.getUrl(linkedRepo.logoStorageId)
            : undefined,
          path: link.path,
          branchName: link.branchName,
          baseBranch: link.baseBranch,
          prUrl: linkedPr?.prUrl,
          prState: linkedPr?.state,
          installDependencies: link.installDependencies,
          clonedAt: link.clonedAt,
          devPort: link.devPort,
        };
      }),
    );

    return [primary, ...linked];
  },
});

/** One linked repo's row by id, for the sandbox action that clones/prepares it. */
export const getSessionRepoInternal = internalQuery({
  args: { id: v.id("sessionRepos") },
  returns: v.union(sessionRepoValidator, v.null()),
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

/** The session's linked repo rows, for sandbox clone/publish paths. */
export const listLinkedReposInternal = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.array(sessionRepoValidator),
  handler: async (ctx, args) =>
    await ctx.db
      .query("sessionRepos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect(),
});

/** Records clone completion for one linked repo. */
export const patchSessionRepo = internalMutation({
  args: {
    id: v.id("sessionRepos"),
    clonedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { clonedAt: args.clonedAt });
    return null;
  },
});
