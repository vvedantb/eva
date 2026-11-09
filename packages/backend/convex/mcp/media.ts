import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";

// Agent-facing media hosting for the MCP `upload_media` / `get_media_url`
// tools — lets sandbox agents host a screenshot/recording at a permanent
// public URL so it can be embedded in a GitHub PR comment or Linear issue
// (chat attachments are not visible outside Eva).

/** Generates a temporary upload URL a sandbox agent can POST raw bytes to. */
export const generateUploadUrl = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Resolves a storageId (as a raw string) to its permanent public URL and metadata. */
export const getUrl = internalQuery({
  args: { storageId: v.string() },
  returns: v.union(
    v.object({
      url: v.string(),
      contentType: v.union(v.string(), v.null()),
      size: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const storageId = ctx.db.system.normalizeId("_storage", args.storageId);
    if (!storageId) return null;

    const meta = await ctx.db.system.get("_storage", storageId);
    if (!meta) return null;

    const url = await ctx.storage.getUrl(storageId);
    if (!url) return null;

    return {
      url,
      contentType: meta.contentType ?? null,
      size: meta.size,
    };
  },
});

/**
 * Parses agent-supplied storage ids for the `evaluate` tool's images. Ids that
 * do not name a stored file are dropped by name, so the tool can say which
 * image it could not find instead of failing the whole call.
 */
export const resolveImageRefs = internalQuery({
  args: {
    refs: v.array(v.object({ name: v.string(), storageId: v.string() })),
  },
  returns: v.object({
    found: v.array(v.object({ name: v.string(), storageId: v.id("_storage") })),
    missing: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const found: { name: string; storageId: Id<"_storage"> }[] = [];
    const missing: string[] = [];
    for (const ref of args.refs) {
      const storageId = ctx.db.system.normalizeId("_storage", ref.storageId);
      const meta = storageId
        ? await ctx.db.system.get("_storage", storageId)
        : null;
      if (storageId && meta) found.push({ name: ref.name, storageId });
      else missing.push(ref.name);
    }
    return { found, missing };
  },
});
