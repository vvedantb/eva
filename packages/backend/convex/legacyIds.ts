import { v } from "convex/values";
import { authQuery, hasRepoAccess } from "./functions";
import { repoEntityTypeValidator } from "./validators";

/**
 * Maps a legacy Convex document id sitting in a URL to the entity's per-repo
 * numId, so the route can redirect to its canonical URL.
 *
 * Detail routes moved to numId segments in July 2026, but links minted before
 * that still carry raw ids — notification `href`s written at insert time and
 * never rewritten, plus the "view in Eva" links `_env/webAppUrl.ts` puts in
 * PR bodies. Those all render "not found" today.
 *
 * The document must live on the repo in the URL: a sibling-repo hit would
 * redirect to a numId that resolves to a *different* document on this repo.
 */
export const resolveNumId = authQuery({
  args: {
    repoId: v.id("githubRepos"),
    entityType: repoEntityTypeValidator,
    /** Untrusted URL segment — validated by `normalizeId`, not by the arg type. */
    docId: v.string(),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;

    const id = ctx.db.normalizeId(args.entityType, args.docId);
    if (id === null) return null;

    const doc = await ctx.db.get(id);
    if (!doc || doc.repoId !== args.repoId) return null;
    // Tasks and projects are archived, never deleted: an archived one opens.
    if ("deletedAt" in doc && doc.deletedAt !== undefined) return null;
    return doc.numId ?? null;
  },
});
