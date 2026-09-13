import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authQuery, authMutation, hasRepoAccess } from "./functions";
import { internalMutation } from "./_generated/server";
import { docVersionSourceValidator } from "./validators";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";

const VERSION_CAP = 100;

/** True when the latest saved version already holds this exact pmContent. */
async function isSameAsLatestVersion(
  ctx: MutationCtx,
  docId: Id<"docs">,
  pmContent: string,
): Promise<boolean> {
  const latest = await ctx.db
    .query("docVersions")
    .withIndex("by_doc", (q) => q.eq("docId", docId))
    .order("desc")
    .first();
  return latest !== null && latest.pmContent === pmContent;
}

/** Prunes oldest versions when a doc exceeds the cap. */
async function pruneOldVersions(
  ctx: MutationCtx,
  docId: Id<"docs">,
): Promise<void> {
  const allVersions = await ctx.db
    .query("docVersions")
    .withIndex("by_doc", (q) => q.eq("docId", docId))
    .order("asc")
    .collect();
  if (allVersions.length > VERSION_CAP) {
    const toDelete = allVersions.slice(0, allVersions.length - VERSION_CAP);
    for (const ver of toDelete) {
      await ctx.db.delete(ver._id);
    }
  }
}

const versionListItemValidator = v.object({
  _id: v.id("docVersions"),
  title: v.string(),
  authorIds: v.array(v.id("users")),
  headSha: v.optional(v.string()),
  source: v.optional(docVersionSourceValidator),
  createdAt: v.number(),
});

const versionDetailValidator = v.object({
  _id: v.id("docVersions"),
  docId: v.id("docs"),
  title: v.string(),
  content: v.string(),
  pmContent: v.string(),
  authorIds: v.array(v.id("users")),
  headSha: v.optional(v.string()),
  source: v.optional(docVersionSourceValidator),
  createdAt: v.number(),
});

/** Upserts a draft entry, tracking who has edited since the last saved version. */
export const touchDraft = authMutation({
  args: { docId: v.id("docs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || !(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId)))
      throw new Error("Document not found");
    const existing = await ctx.db
      .query("docVersionDrafts")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .first();
    const now = Date.now();
    if (existing) {
      const authorIds = existing.authorIds.includes(ctx.userId)
        ? existing.authorIds
        : [...existing.authorIds, ctx.userId];
      await ctx.db.patch(existing._id, { authorIds, updatedAt: now });
    } else {
      await ctx.db.insert("docVersionDrafts", {
        docId: args.docId,
        authorIds: [ctx.userId],
        updatedAt: now,
      });
    }
    return null;
  },
});

/** Saves a version snapshot. Dedupes against the latest version. */
export const saveVersion = authMutation({
  args: {
    docId: v.id("docs"),
    content: v.string(),
    pmContent: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || !(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId)))
      throw new Error("Document not found");

    if (await isSameAsLatestVersion(ctx, args.docId, args.pmContent))
      return null;

    const draft = await ctx.db
      .query("docVersionDrafts")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .first();
    const authorIds =
      draft && draft.authorIds.length > 0 ? draft.authorIds : [ctx.userId];

    await ctx.db.insert("docVersions", {
      docId: args.docId,
      title: doc.title,
      content: args.content,
      pmContent: args.pmContent,
      authorIds,
      source: "manual",
      createdAt: Date.now(),
    });

    if (draft) {
      await ctx.db.delete(draft._id);
    }

    await pruneOldVersions(ctx, args.docId);

    return null;
  },
});

/**
 * Saves a PR recap snapshot before server-side content overwrite (per-push
 * history). Called from upsertPrRecapDoc, not from the client editor.
 */
export const saveRecapSnapshot = internalMutation({
  args: {
    docId: v.id("docs"),
    title: v.string(),
    content: v.string(),
    pmContent: v.string(),
    headSha: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await isSameAsLatestVersion(ctx, args.docId, args.pmContent))
      return null;

    await ctx.db.insert("docVersions", {
      docId: args.docId,
      title: args.title,
      content: args.content,
      pmContent: args.pmContent,
      authorIds: [],
      headSha: args.headSha,
      source: "recap-regeneration",
      createdAt: Date.now(),
    });

    await pruneOldVersions(ctx, args.docId);

    return null;
  },
});

/** Lists versions (lightweight, no content fields). */
export const list = authQuery({
  args: { docId: v.id("docs") },
  returns: v.array(versionListItemValidator),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || !(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId)))
      return [];
    const versions = await ctx.db
      .query("docVersions")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .order("desc")
      .collect();
    return versions.map((ver) => ({
      _id: ver._id,
      title: ver.title,
      authorIds: ver.authorIds,
      headSha: ver.headSha,
      source: ver.source,
      createdAt: ver.createdAt,
    }));
  },
});

/** Fetches a full version by ID. */
export const get = authQuery({
  args: { id: v.id("docVersions") },
  returns: v.union(versionDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.id);
    if (!version) return null;
    const doc = await ctx.db.get(version.docId);
    if (!doc || !(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId)))
      return null;
    return {
      _id: version._id,
      docId: version.docId,
      title: version.title,
      content: version.content,
      pmContent: version.pmContent,
      authorIds: version.authorIds,
      headSha: version.headSha,
      source: version.source,
      createdAt: version.createdAt,
    };
  },
});
