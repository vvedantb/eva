import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { projectFields } from "../validators";

const projectDocValidator = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  ...projectFields,
});

/** Retrieves a project by ID for internal use (no auth check). */
export const getInternal = internalQuery({
  args: { id: v.id("projects") },
  returns: v.union(projectDocValidator, v.null()),
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
  returns: v.union(projectDocValidator, v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("projects", args.id);
    if (!id) return null;
    return await ctx.db.get(id);
  },
});

