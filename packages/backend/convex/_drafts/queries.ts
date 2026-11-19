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
        if (draft.kind === "taskComment" && draft.taskId) {
          const task = await ctx.db.get(draft.taskId);
          if (!task) return null;
          return {
            ...draft,
            contextTitle: task.title || "Untitled",
            taskProjectId: task.projectId,
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

/**
 * Where the current user has an unsent draft in a repo: the sessions with a
 * chat draft and the tasks with a comment draft. Rows show a draft mark from
 * this; it reads only the user's draft index, no surface docs.
 */
export const listMarks = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.object({
    sessionIds: v.array(v.id("sessions")),
    taskIds: v.array(v.id("agentTasks")),
  }),
  handler: async (ctx, args) => {
    const empty = { sessionIds: [], taskIds: [] };
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return empty;
    const rows = await ctx.db
      .query("drafts")
      .withIndex("by_user_and_repo", (q) =>
        q.eq("userId", ctx.userId).eq("repoId", args.repoId),
      )
      .collect();
    const sessionIds = new Set<Id<"sessions">>();
    const taskIds = new Set<Id<"agentTasks">>();
    for (const row of rows) {
      if (row.kind === "sessionChat" && row.sessionId) sessionIds.add(row.sessionId);
      if (row.kind === "taskComment" && row.taskId) taskIds.add(row.taskId);
    }
    return { sessionIds: [...sessionIds], taskIds: [...taskIds] };
  },
});
