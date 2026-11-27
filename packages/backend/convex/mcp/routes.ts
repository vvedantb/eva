"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { resolveAllEnvVars } from "../envVarResolver";
import type { Id } from "../_generated/dataModel";

function isRepoId(id: string): id is Id<"githubRepos"> {
  return id.length > 0 && !/\s/.test(id);
}

/** Resolves and decrypts all environment variables for a repo (team + repo-level merged). */
export const getDecryptedRepoEnvVars = internalAction({
  args: { repoId: v.string() },
  returns: v.array(v.object({ key: v.string(), value: v.string() })),
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ key: string; value: string }>> => {
    if (!isRepoId(args.repoId)) {
      return [];
    }

    const merged = await resolveAllEnvVars(ctx, args.repoId);
    return Object.entries(merged).map(([key, value]) => ({ key, value }));
  },
});
