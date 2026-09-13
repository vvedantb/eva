"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { detectAppsForRepo } from "./helpers";
import { isSandboxIdentity } from "../_auth/sandboxIdentity";

/** Syncs all GitHub App installation repos into the database, detecting monorepo apps and updating connected status. */
export const syncRepos = action({
  args: {},
  returns: v.object({ success: v.boolean(), synced: v.number() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }


    const accessibleRepos = await ctx.runQuery(api.githubRepos.list, {
      includeHidden: true,
    });
    const syncSettings = await ctx.runQuery(api.syncSettings.list, {});
    const disabledRepos = new Set(
      syncSettings
        .filter((s: { enabled: boolean }) => !s.enabled)
        .map((s: { owner: string; name: string }) => `${s.owner}/${s.name}`),
    );

    const detectedApps: Array<{
      owner: string;
      name: string;
      paths: string[];
    }> = [];
    const monorepos: Array<{ owner: string; name: string }> = [];
    let totalAdded = 0;
    const seenCodebases = new Set<string>();
    for (const existingRepo of accessibleRepos) {
      const codebaseKey = `${existingRepo.owner}/${existingRepo.name}`;
      if (seenCodebases.has(codebaseKey) || disabledRepos.has(codebaseKey)) {
        continue;
      }
      seenCodebases.add(codebaseKey);

      const octokit = await getInstallationOctokit(existingRepo.installationId);
      const { data: repo } = await octokit.rest.repos.get({
        owner: existingRepo.owner,
        repo: existingRepo.name,
      });
      const id = await ctx.runMutation(internal.githubRepos.upsert, {
        owner: repo.owner.login,
        name: repo.name,
        installationId: existingRepo.installationId,
        githubId: repo.id,
        teamId: existingRepo.teamId,
      });

      const apps = await detectAppsForRepo(octokit, repo.owner.login, repo.name);
      const appPaths: string[] = [];
      for (const app of apps) {
        await ctx.runMutation(internal.githubRepos.upsert, {
          owner: repo.owner.login,
          name: repo.name,
          installationId: existingRepo.installationId,
          githubId: repo.id,
          teamId: existingRepo.teamId,
          rootDirectory: app.path,
          parentRepoId: id,
        });
        appPaths.push(app.path);
      }
      detectedApps.push({
        owner: repo.owner.login,
        name: repo.name,
        paths: appPaths,
      });
      if (apps.length > 0) {
        monorepos.push({ owner: repo.owner.login, name: repo.name });
      }
      totalAdded++;
    }

    await ctx.runMutation(internal.githubRepos.cleanupStaleSubApps, {
      detectedApps,
    });

    await ctx.runMutation(internal.githubRepos.cleanupMonorepoRoots, {
      monorepos,
    });

    return { success: true, synced: totalAdded };
  },
});
