import { v } from "convex/values";
import {
  authQuery,
  hasRepoAccess,
  hasSessionAccess,
  hasTaskAccess,
} from "../functions";
import { draftFields, draftTarget } from "../validators";
import { resolveTarget } from "./helpers";
import type { Id, Doc } from "../_generated/dataModel";

/** Returns the stored draft content for a given surface target, or null if none. */
export const getForTarget = authQuery({
  args: { target: draftTarget },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const { findExisting } = await resolveTarget(
      ctx.db,
      ctx.userId,
      args.target,
    );
    const draft = await findExisting();
    return draft?.content ?? null;
  },
});

const draftListItemValidator = v.object({
  _id: v.id("drafts"),
  _creationTime: v.number(),
  ...draftFields,
  contextTitle: v.string(),
  taskProjectId: v.optional(v.id("projects")),
});

/**
 * Lists all drafts for a repo belonging to the current user, sorted newest
 * first. Surface docs that have since been deleted are skipped silently.
 */
export const listForRepo = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(draftListItemValidator),
  handler: async (ctx, args) => {
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return [];

    const rows = await ctx.db
      .query("drafts")
      .withIndex("by_user_and_repo", (q) =>
        q.eq("userId", ctx.userId).eq("repoId", args.repoId),
      )
      .collect();

    type DraftListItem = Doc<"drafts"> & {
      contextTitle: string;
      taskProjectId: Id<"projects"> | undefined;
    };
    const results: DraftListItem[] = [];

    for (const draft of rows) {
      let contextTitle = "Untitled";
      let taskProjectId: Id<"projects"> | undefined = undefined;

      if (
        (draft.kind === "taskComment" || draft.kind === "taskChat") &&
        draft.taskId
      ) {
        const task = await ctx.db.get(draft.taskId);
        if (!task || !(await hasTaskAccess(ctx.db, task, ctx.userId))) continue;
        contextTitle = task.title || "Untitled";
        taskProjectId = task.projectId;
      } else if (draft.kind === "projectChat" && draft.projectId) {
        const project = await ctx.db.get(draft.projectId);
        if (!project) continue;
        contextTitle = project.title || "Untitled";
      } else if (draft.kind === "sessionChat" && draft.sessionId) {
        const session = await ctx.db.get(draft.sessionId);
        if (!session || !(await hasSessionAccess(ctx.db, session, ctx.userId)))
          continue;
        contextTitle = session.title || "Untitled";
      }

      results.push({
        ...draft,
        contextTitle,
        taskProjectId,
      });
    }

    // Sort newest draft first.
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});
