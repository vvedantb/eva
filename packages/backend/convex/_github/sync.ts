"use node";

import { type Infer, v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { detectAppsForRepo } from "./helpers";

const newAppValidator = v.object({
  owner: v.string(),
  name: v.string(),
  installationId: v.number(),
  teamId: v.optional(v.id("teams")),
  appName: v.string(),
  path: v.string(),
  hasDevScript: v.boolean(),
});

/**
 * Syncs all GitHub App installation repos into the database, detecting monorepo
 * apps and updating connected status. Apps already in Eva are refreshed (a
 * hidden app stays hidden). Apps seen for the first time are not added: they
 * come back in `newApps`, and the user picks which to add
 * (`github:importDetectedApps`).
 */
export const syncRepos = action({
  args: {},
  returns: v.object({
    success: v.boolean(),
    synced: v.number(),
    newApps: v.array(newAppValidator),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const accessibleRepos = await ctx.runQuery(api.githubRepos.list, {
      includeHidden: true,
    });

    const detectedApps: Array<{
      owner: string;
      name: string;
      paths: string[];
    }> = [];
    const monorepos: Array<{ owner: string; name: string }> = [];
    const newApps: Array<Infer<typeof newAppValidator>> = [];
    let totalAdded = 0;
    const seenCodebases = new Set<string>();
    for (const existingRepo of accessibleRepos) {
      const codebaseKey = `${existingRepo.owner}/${existingRepo.name}`;
      if (seenCodebases.has(codebaseKey)) {
        continue;
      }
      seenCodebases.add(codebaseKey);

      // githubAuth caches the token, so later repos of the installation reuse it.
      const octokit = await getInstallationOctokit(existingRepo.installationId);
      const { data: repo } = await octokit.rest.repos.get({
        owner: existingRepo.owner,
        repo: existingRepo.name,
      });
      const [id, apps] = await Promise.all([
        ctx.runMutation(internal.githubRepos.upsert, {
          owner: repo.owner.login,
          name: repo.name,
          installationId: existingRepo.installationId,
          githubId: repo.id,
          teamId: existingRepo.teamId,
        }),
        detectAppsForRepo(octokit, repo.owner.login, repo.name),
      ]);
      const appPaths: string[] = [];
      let hasAddedApp = false;
      // Sequential on purpose: every app upsert reads and inserts into the same
      // `by_github_id` range, so parallel ones would only conflict and retry.
      for (const app of apps) {
        const state = await ctx.runMutation(internal.githubRepos.syncDetectedApp, {
          owner: repo.owner.login,
          name: repo.name,
          installationId: existingRepo.installationId,
          githubId: repo.id,
          teamId: existingRepo.teamId,
          rootDirectory: app.path,
          parentRepoId: id,
        });
        appPaths.push(app.path);
        if (state === "kept") hasAddedApp = true;
        if (state === "new") {
          newApps.push({
            owner: repo.owner.login,
            name: repo.name,
            installationId: existingRepo.installationId,
            teamId: existingRepo.teamId,
            appName: app.name,
            path: app.path,
            hasDevScript: app.hasDevScript,
          });
        }
      }
      detectedApps.push({
        owner: repo.owner.login,
        name: repo.name,
        paths: appPaths,
      });
      // The root row goes only once an app row replaces it; with only new
      // apps, it is the codebase's last row.
      if (hasAddedApp) {
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

    return { success: true, synced: totalAdded, newApps };
  },
});
