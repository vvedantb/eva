import { v } from "convex/values";
import { parseGeneratedTags } from "@eva/shared";
import { internalMutation, internalQuery } from "../_generated/server";
import { agentTaskValidator, normalizeTaskTags } from "./helpers";

/** Retrieves a task by ID for internal use (no auth check). */
export const getInternal = internalQuery({
  args: { id: v.id("agentTasks") },
  returns: v.union(agentTaskValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Merges model-suggested tags into a task. Re-reads current tags rather than
 * trusting the snapshot the action was scheduled with, so tags the user picked
 * while the model was running are preserved and never duplicated. Re-parses
 * against the vocabulary so a bad action payload cannot write junk.
 */
export const applyGeneratedTags = internalMutation({
  args: { taskId: v.id("agentTasks"), tags: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const current = task.tags ?? [];
    const generated = parseGeneratedTags(args.tags.join(","), current);
    if (generated.length === 0) return null;
    const merged = normalizeTaskTags([...current, ...generated]);
    if (!merged || merged.length === current.length) return null;
    await ctx.db.patch(args.taskId, { tags: merged, updatedAt: Date.now() });
    return null;
  },
});
