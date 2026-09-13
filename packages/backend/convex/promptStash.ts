import { v } from "convex/values";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { promptStashFields } from "./validators";
import { resolveStorageEntries } from "./_chat/storageUrls";

/** Max stashed prompts per user per repo; oldest (`_creationTime`) is evicted. */
const MAX_STASHES_PER_REPO = 20;

const promptStashAttachmentValidator = v.object({
  url: v.string(),
  contentType: v.union(v.string(), v.null()),
});

const promptStashListItemValidator = v.object({
  _id: v.id("promptStashes"),
  _creationTime: v.number(),
  ...promptStashFields,
  attachments: v.array(promptStashAttachmentValidator),
});

/**
 * Prompt stash (⌘S) — frozen composer snapshots, not live drafts.
 *
 * Drafts (`drafts` table): one autosaved WIP per chat/comment surface.
 * Stashes (this table): many explicit queue entries per user+repo; restore
 * appends into the current composer and consumes the entry. See
 * `internal/docs/prompt-stash-vs-drafts.md`.
 */

/** Saves a composer snapshot; evicts the oldest row when over the per-repo cap. */
export const add = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    content: v.string(),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.object({ evicted: v.boolean() }),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    const attachmentStorageIds = args.attachmentStorageIds ?? [];
    const hasText = args.content.trim().length > 0;
    if (!hasText && attachmentStorageIds.length === 0) {
      throw new Error("Stash cannot be empty");
    }

    const existing = await ctx.db
      .query("promptStashes")
      .withIndex("by_user_and_repo", (q) =>
        q.eq("userId", ctx.userId).eq("repoId", args.repoId),
      )
      .order("asc")
      .collect();

    let evicted = false;
    while (existing.length >= MAX_STASHES_PER_REPO) {
      const oldest = existing.shift();
      if (!oldest) break;
      await ctx.db.delete(oldest._id);
      for (const storageId of oldest.attachmentStorageIds ?? []) {
        await ctx.storage.delete(storageId);
      }
      evicted = true;
    }

    await ctx.db.insert("promptStashes", {
      userId: ctx.userId,
      repoId: args.repoId,
      content: args.content,
      attachmentStorageIds:
        attachmentStorageIds.length > 0 ? attachmentStorageIds : undefined,
    });

    return { evicted };
  },
});

/** Lists the current user's stashes for a repo, newest first, with attachment URLs. */
export const listForRepo = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(promptStashListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      return [];
    }

    const rows = await ctx.db
      .query("promptStashes")
      .withIndex("by_user_and_repo", (q) =>
        q.eq("userId", ctx.userId).eq("repoId", args.repoId),
      )
      .order("desc")
      .collect();

    return Promise.all(
      rows.map(async (row) => {
        const attachments = (
          await resolveStorageEntries(
            (id) => ctx.storage.getUrl(id),
            (id) => ctx.storage.getMetadata(id),
            row.attachmentStorageIds,
          )
        )
          .filter((entry) => entry.url !== null)
          .map((entry) => ({
            url: entry.url as string,
            contentType: entry.contentType,
          }));
        return {
          ...row,
          attachments,
        };
      }),
    );
  },
});

/**
 * Deletes a stash row and its blobs. Idempotent if missing. Owner-only.
 * Used for hover-delete and restore-consume.
 */
export const remove = authMutation({
  args: { id: v.id("promptStashes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) {
      return null;
    }
    if (row.userId !== ctx.userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.id);
    for (const storageId of row.attachmentStorageIds ?? []) {
      await ctx.storage.delete(storageId);
    }
    return null;
  },
});
