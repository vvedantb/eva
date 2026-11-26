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

