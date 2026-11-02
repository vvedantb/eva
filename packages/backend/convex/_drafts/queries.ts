import { v } from "convex/values";
import { authQuery, hasRepoAccess } from "../functions";
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
    // Surfaces are independent reads; a gone surface yields null (skipped).
    const items = await Promise.all(
      rows.map(async (draft): Promise<DraftListItem | null> => {
        if (
          (draft.kind === "taskComment" || draft.kind === "taskChat") &&
          draft.taskId
        ) {
          const task = await ctx.db.get(draft.taskId);
          if (!task) return null;
          return {
            ...draft,
            contextTitle: task.title || "Untitled",
            taskProjectId: task.projectId,
          };
        }
        if (draft.kind === "projectChat" && draft.projectId) {
          const project = await ctx.db.get(draft.projectId);
          if (!project) return null;
          return {
            ...draft,
            contextTitle: project.title || "Untitled",
            taskProjectId: undefined,
          };
        }
        if (draft.kind === "sessionChat" && draft.sessionId) {
          const session = await ctx.db.get(draft.sessionId);
          if (!session) return null;
          return {
            ...draft,
            contextTitle: session.title || "Untitled",
            taskProjectId: undefined,
          };
        }
        return { ...draft, contextTitle: "Untitled", taskProjectId: undefined };
      }),
    );
    const results = items.filter(
      (item): item is DraftListItem => item !== null,
    );

    // Sort newest draft first.
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});
