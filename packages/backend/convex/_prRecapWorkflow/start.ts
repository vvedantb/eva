import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import {
  findSameTeamSiblingRepos,
  hasCodebaseRepoAccess,
} from "../_githubRepos/helpers";

/** Picks the workflow repo row for a codebase: the root row, else the first sibling. */
function pickWorkflowRepo(
  siblings: Array<Doc<"githubRepos">>,
): Doc<"githubRepos"> | undefined {
  return (
    siblings.find((repo) => repo.rootDirectory === undefined) ?? siblings[0]
  );
}

/** Manual Generate context: access-checked; recaps only ever run from the panel button. */
export const getManualRecapContext = internalQuery({
  args: {
    repoId: v.id("githubRepos"),
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      workflowRepoId: v.id("githubRepos"),
      installationId: v.number(),
      owner: v.string(),
      name: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!(await hasCodebaseRepoAccess(ctx.db, args.repoId, args.userId))) {
      return null;
    }
    const siblings = await findSameTeamSiblingRepos(ctx.db, args.repoId);
    const workflowRepo = pickWorkflowRepo(siblings);
    if (!workflowRepo) return null;
    return {
      workflowRepoId: workflowRepo._id,
      installationId: workflowRepo.installationId,
      owner: workflowRepo.owner,
      name: workflowRepo.name,
    };
  },
});
