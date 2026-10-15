import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { projectSummaryValidator } from "./helpers";

/** Retrieves a project by ID for internal use (no auth check). */
export const getInternal = internalQuery({
  args: { id: v.id("projects") },
  returns: v.union(projectSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Same as `getInternal` but takes an unbranded string id (normalized against
 * the table). Used where the caller only has a plain string, e.g. the
 * entityId claim on an MCP token (browser_start).
 */
export const getInternalByStringId = internalQuery({
  args: { id: v.string() },
  returns: v.union(projectSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("projects", args.id);
    if (!id) return null;
    return await ctx.db.get(id);
  },
});

/** Project owning a sandbox — preview recovery relaunches services through it. */
export const getBySandboxInternal = internalQuery({
  args: { sandboxId: v.string() },
  returns: v.union(projectSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", args.sandboxId))
      .first();
  },
});
