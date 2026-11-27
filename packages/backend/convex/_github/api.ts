"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { type ActionCtx, action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getInstallationOctokit,
  mintSandboxGitToken,
  SANDBOX_GIT_WRITE,
} from "../githubAuth";
import { isReadOnlyGitIdentity } from "../_auth/sandboxIdentity";
import { detectAppsForRepo, resolveInstallationRepo } from "./helpers";
import { authAction, getActionRepoWithAccess } from "../functions";
import { assertUserCanUseRepo, listInstallationReposForUser } from "./userAuth";

const listAccessibleReposRef = makeFunctionReference<
  "query",
  { includeHidden?: boolean },
  Doc<"githubRepos">[]
>("githubRepos:list");

type InstallationAccessState = "unclaimed" | "owner" | "member" | "denied";

const installationAccessStateRef = makeFunctionReference<
  "query",
  { installationId: number },
  InstallationAccessState
>("githubRepos:getInstallationAccessState");

/**
 * Returns a short-lived installation token for a given GitHub repo's app
 * installation. The in-sandbox runner refreshes `GITHUB_TOKEN` / `GH_TOKEN`
 * here; a read-only sandbox's VM token (`isReadOnlyGitIdentity`) gets a
 * read-only token for that repo only.
 */
export const getInstallationTokenAction = action({
  args: { repoId: v.id("githubRepos") },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const repo = await getActionRepoWithAccess(ctx, args.repoId);
    const readOnly = isReadOnlyGitIdentity(await ctx.auth.getUserIdentity());
    const { token } = await mintSandboxGitToken(
      repo.installationId,
      readOnly ? { kind: "read", repo } : SANDBOX_GIT_WRITE,
    );
    return { token };
  },
});

/** Lists all branches for a given repository via the GitHub API. */
export const listBranches = action({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(v.object({ name: v.string(), protected: v.boolean() })),
  handler: async (ctx, args) => {
    const repo = await getActionRepoWithAccess(ctx, args.repoId);
    const octokit = await getInstallationOctokit(repo.installationId);
    const allBranches = await octokit.paginate(
      octokit.rest.repos.listBranches,
      {
        owner: repo.owner,
        repo: repo.name,
        per_page: 100,
      },
    );
    return allBranches.map((b) => ({ name: b.name, protected: b.protected }));
  },
});

/** Lists all repositories accessible to a specific GitHub App installation. */
export const listRepos = authAction({
  args: { installationId: v.number() },
  returns: v.array(
    v.object({
      id: v.number(),
      name: v.string(),
      fullName: v.string(),
      owner: v.string(),
      private: v.boolean(),
      url: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const accessState = await ctx.runQuery(installationAccessStateRef, {
      installationId: args.installationId,
    });
    if (accessState === "denied") {
      throw new Error("Not authorized to inspect this installation");
    }
    if (accessState === "unclaimed") {
      return await listInstallationReposForUser(
        ctx,
        ctx.userId,
        args.installationId,
      );
    }
    const octokit = await getInstallationOctokit(args.installationId);
    const repos = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });
    return repos.data.repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      private: repo.private,
      url: repo.html_url,
    }));
  },
});

/** Detects monorepo sub-applications in a repository's apps/ directory. */
export const detectMonorepoApps = authAction({
  args: {
    installationId: v.number(),
    owner: v.string(),
    name: v.string(),
  },
  returns: v.array(
    v.object({
      name: v.string(),
      path: v.string(),
      hasDevScript: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const accessState = await ctx.runQuery(installationAccessStateRef, {
      installationId: args.installationId,
    });
    if (accessState === "denied") {
      throw new Error("Not authorized to inspect this installation");
    }
    if (accessState === "unclaimed") {
      await assertUserCanUseRepo(
        ctx,
        ctx.userId,
        args.installationId,
        args.owner,
        args.name,
      );
    }
    const repo = await resolveInstallationRepo(
      args.installationId,
      args.owner,
      args.name,
    );
    const octokit = await getInstallationOctokit(args.installationId);
    return detectAppsForRepo(octokit, repo.owner, repo.name);
  },
});

async function authorizeInstallationRepo(
  ctx: ActionCtx,
  userId: Id<"users">,
  args: { installationId: number; owner: string; name: string },
) {
  const accessState = await ctx.runQuery(installationAccessStateRef, {
    installationId: args.installationId,
  });
  if (accessState === "denied") {
    throw new Error(
      "Not authorized to add repositories from this installation",
    );
  }
  if (accessState === "unclaimed") {
    await assertUserCanUseRepo(
      ctx,
      userId,
      args.installationId,
      args.owner,
      args.name,
    );
  }
  return await resolveInstallationRepo(
    args.installationId,
    args.owner,
    args.name,
  );
}

export const connectRepo = authAction({
  args: {
    owner: v.string(),
    name: v.string(),
    installationId: v.number(),
    rootDirectory: v.optional(v.string()),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.id("githubRepos"),
  handler: async (ctx, args): Promise<Id<"githubRepos">> => {
    const repo = await authorizeInstallationRepo(ctx, ctx.userId, args);
    return await ctx.runMutation(
      internal._githubRepos.mutations.createForInstallation,
      {
        owner: repo.owner,
        name: repo.name,
        githubId: repo.githubId,
        installationId: args.installationId,
        rootDirectory: args.rootDirectory,
        teamId: args.teamId,
        userId: ctx.userId,
      },
    );
  },
});

/**
 * Saves the user's picks from the "New apps found" sync popup for one
 * codebase: ticked apps are added, unticked ones are added hidden, so sync
 * does not offer them again. Hidden Codebases can show them later.
 */
export const importDetectedApps = authAction({
  args: {
    owner: v.string(),
    name: v.string(),
    installationId: v.number(),
    teamId: v.optional(v.id("teams")),
    apps: v.array(v.object({ path: v.string(), add: v.boolean() })),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const repo = await authorizeInstallationRepo(ctx, ctx.userId, args);
    for (const app of args.apps) {
      await ctx.runMutation(
        internal._githubRepos.mutations.createForInstallation,
        {
          owner: repo.owner,
          name: repo.name,
          githubId: repo.githubId,
          installationId: args.installationId,
          rootDirectory: app.path,
          teamId: args.teamId,
          userId: ctx.userId,
          hidden: !app.add,
          ifMissing: true,
        },
      );
    }
    return null;
  },
});

/** Lists only repository rows the current Eva user can already access. */
export const listAllAvailableRepos = action({
  args: {},
  returns: v.array(
    v.object({
      owner: v.string(),
      name: v.string(),
      githubId: v.number(),
      private: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const repos = await ctx.runQuery(listAccessibleReposRef, {
      includeHidden: true,
    });
    const seen = new Set<number>();
    return repos.flatMap((repo) => {
      if (repo.githubId === undefined || seen.has(repo.githubId)) return [];
      seen.add(repo.githubId);
      return [
        {
          owner: repo.owner,
          name: repo.name,
          githubId: repo.githubId,
          private: true,
        },
      ];
    });
  },
});
