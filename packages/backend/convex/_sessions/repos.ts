import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { authQuery, hasRepoAccess } from "../functions";
import { prStateValidator, sessionRepoFields } from "../validators";
import { resolveSessionBaseBranch } from "./baseBranch";
import { PRIMARY_REPO_DIR } from "../_sandbox_runtime/workspaceLayout";

/**
 * The repos checked out in one session's sandbox: the primary (`sessions.repoId`,
 * always at `/tmp/repo`) plus every `sessionRepos` row cloned beside it under
 * `/tmp/workspace`.
 */

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
    const branchName = session.branchName ?? `eva/session-${session._id}`;
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
      prUrl: session.prUrl,
      prState: session.prState,
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
          prUrl: link.prUrl,
          prState: link.prState,
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

/** Records clone completion or PR state for one linked repo. */
export const patchSessionRepo = internalMutation({
  args: {
    id: v.id("sessionRepos"),
    clonedAt: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    prState: v.optional(prStateValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      ...(args.clonedAt !== undefined ? { clonedAt: args.clonedAt } : {}),
      ...(args.prUrl !== undefined ? { prUrl: args.prUrl } : {}),
      ...(args.prState !== undefined ? { prState: args.prState } : {}),
    });
    return null;
  },
});

/** Resolves a linked repo from a PR URL (GitHub webhook fan-out). */
export const findSessionRepoByPrUrl = internalQuery({
  args: { prUrl: v.string() },
  returns: v.union(sessionRepoValidator, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("sessionRepos")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl))
      .first(),
});
