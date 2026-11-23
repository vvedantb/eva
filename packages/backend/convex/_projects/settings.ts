import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  authMutation,
  getProjectWithAccess,
  getRepoWithAccess,
} from "../functions";

/** Every repo a task of the project may target: the home repo first, then the extra repos. */
export function projectRepoIds(
  project: Pick<Doc<"projects">, "repoId" | "extraRepoIds">,
): Id<"githubRepos">[] {
  return [project.repoId, ...(project.extraRepoIds ?? [])];
}

/** Throws unless `repoId` is the project's home repo or one of its extra repos. */
export function assertProjectRepo(
  project: Pick<Doc<"projects">, "repoId" | "extraRepoIds">,
  repoId: Id<"githubRepos">,
): void {
  if (!projectRepoIds(project).includes(repoId)) {
    throw new Error(
      "This repository is not part of the project. Add it in project settings first.",
    );
  }
}

/** Sets the text added to the coordinator's and every child task's prompt. Empty clears it. */
export const setInstructions = authMutation({
  args: { projectId: v.id("projects"), instructions: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    const instructions = args.instructions.trim();
    await ctx.db.patch(args.projectId, {
      instructions: instructions || undefined,
    });
    return null;
  },
});

/**
 * Replaces the project's extra repos. A person can add only a repo they can
 * access; keeping or removing a repo already on the list needs none. The home
 * repo is never on the list. Tasks already in a removed repo keep it.
 */
export const setExtraRepoIds = authMutation({
  args: {
    projectId: v.id("projects"),
    repoIds: v.array(v.id("githubRepos")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    const current = new Set(project.extraRepoIds ?? []);
    const next = [...new Set<Id<"githubRepos">>(args.repoIds)].filter(
      (repoId) => repoId !== project.repoId,
    );
    for (const repoId of next) {
      if (!current.has(repoId)) {
        await getRepoWithAccess(ctx.db, repoId, ctx.userId);
      }
    }
    await ctx.db.patch(args.projectId, {
      extraRepoIds: next.length > 0 ? next : undefined,
    });
    return null;
  },
});
