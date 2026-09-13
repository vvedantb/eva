import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import { authQuery, authMutation } from "./functions";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";
import type { DataModel, Id } from "./_generated/dataModel";

/** Finds the current user's annotation row for a page URL, or null. */
function annotationForUrl(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  pageUrl: string,
) {
  return db
    .query("annotations")
    .withIndex("by_user_and_url", (q) =>
      q.eq("userId", userId).eq("pageUrl", pageUrl),
    )
    .first();
}

/** Retrieves the saved annotation pins for a page URL, scoped to the current user. */
export const getByUrl = authQuery({
  args: { pageUrl: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const doc = await annotationForUrl(ctx.db, ctx.userId, args.pageUrl);
    return doc?.pins ?? null;
  },
});

/** Deletes the annotation for a page URL belonging to the current user. */
export const remove = authMutation({
  args: { pageUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const existing = await annotationForUrl(ctx.db, ctx.userId, args.pageUrl);
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/** Creates or updates annotation pins for a page URL, scoped to the current user. */
export const save = authMutation({
  args: { pageUrl: v.string(), pins: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const existing = await annotationForUrl(ctx.db, ctx.userId, args.pageUrl);
    if (existing) {
      await ctx.db.patch(existing._id, {
        pins: args.pins,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("annotations", {
        userId: ctx.userId,
        pageUrl: args.pageUrl,
        pins: args.pins,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
