import { v } from "convex/values";
import { authMutation } from "../functions";
import { rejectSandboxCaller } from "../_auth/sandboxIdentity";
import { draftTarget } from "../validators";
import { resolveTarget } from "./helpers";

/**
 * Creates, updates, or deletes a draft for a surface target.
 * - Empty content after trimming → deletes the existing row (if any).
 * - Non-empty content → patches the existing row or inserts a new one.
 */
export const set = authMutation({
  args: {
    target: draftTarget,
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const { repoId, findExisting } = await resolveTarget(
      ctx.db,
      ctx.userId,
      args.target,
    );

    const existing = await findExisting();

    if (args.content.trim() === "") {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return null;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        updatedAt: Date.now(),
      });
      return null;
    }

    // Build the insert payload by spreading only the FK fields that match the kind.
    const base = {
      userId: ctx.userId,
      repoId,
      kind: args.target.kind,
      content: args.content,
      updatedAt: Date.now(),
    } as const;

    if (args.target.kind === "taskComment") {
      await ctx.db.insert("drafts", {
        ...base,
        taskId: args.target.taskId,
        parentCommentId: args.target.parentCommentId,
      });
    } else if (args.target.kind === "taskChat") {
      await ctx.db.insert("drafts", {
        ...base,
        taskId: args.target.taskId,
      });
    } else if (args.target.kind === "projectChat") {
      await ctx.db.insert("drafts", {
        ...base,
        projectId: args.target.projectId,
      });
    } else {
      await ctx.db.insert("drafts", {
        ...base,
        sessionId: args.target.sessionId,
      });
    }

    return null;
  },
});

/**
 * Removes a draft by ID. Only the owning user may delete their own draft.
 * No-ops silently if the row is already gone.
 */
export const remove = authMutation({
  args: { id: v.id("drafts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const draft = await ctx.db.get(args.id);
    if (draft && draft.userId === ctx.userId) {
      await ctx.db.delete(args.id);
    }
    return null;
  },
});
