"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { readFileAtRef } from "../_github/contents";
import { EVA_CONFIG_PATH, EVA_MCP_PATH } from "./config";

/** `.eva/` files are small JSON; anything bigger is a mistake, not config. */
const MAX_EVA_FILE_BYTES = 200_000;

type GithubTarget = {
  owner: string;
  name: string;
  installationId: number;
};

/** Reads one `.eva/` file at a ref. Missing (or oversize, logged) → null. */
export async function readEvaFileAtRef(
  target: GithubTarget,
  path: string,
  ref: string,
): Promise<string | null> {
  const octokit = await getInstallationOctokit(target.installationId);
  const result = await readFileAtRef(octokit, {
    owner: target.owner,
    name: target.name,
    path,
    ref,
    maxBytes: MAX_EVA_FILE_BYTES,
  });
  if (result.skipped !== null) {
    console.warn(
      `[evaConfig] ${target.owner}/${target.name}@${ref}:${path} skipped (${result.skipped})`,
    );
  }
  return result.contents;
}

/**
 * Syncs the repo's default-branch `.eva/` folder into the Convex cache.
 * Scheduled on connect, on pushes that touch `.eva/`, by the daily repo sync,
 * and at the start of every snapshot build.
 */
export const syncEvaConfig = internalAction({
  args: { repoId: v.id("githubRepos") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const target = await ctx.runQuery(internal._evaConfig.cache.getSyncTarget, {
      repoId: args.repoId,
    });
    if (!target) return null;
    const [configText, mcpText] = await Promise.all([
      readEvaFileAtRef(target, EVA_CONFIG_PATH, target.ref),
      readEvaFileAtRef(target, EVA_MCP_PATH, target.ref),
    ]);
    await ctx.runMutation(internal._evaConfig.cache.applyEvaConfig, {
      owner: target.owner,
      name: target.name,
      ref: target.ref,
      configText,
      mcpText,
    });
    return null;
  },
});
