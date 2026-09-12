"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  getInstallationOctokit,
  getRepoScopedInstallationToken,
} from "../githubAuth";
import { detectAppsForRepo } from "./helpers";
import { authAction, getActionRepoWithAccess } from "../functions";
import { isSandboxIdentity } from "../_auth/sandboxIdentity";
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

/** Returns a short-lived installation token for a given GitHub repo's app installation. */
export const getInstallationTokenAction = action({
  args: {
    repoId: v.id("githubRepos"),
    sandboxId: v.optional(v.string()),
  },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    if (!isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }
    if (!args.sandboxId) throw new Error("Not authorized");
    const bound = await ctx.runQuery(internal.sandboxHeal.isBoundToRepo, {
      sandboxId: args.sandboxId,
      repoId: args.repoId,
    });
    if (!bound) throw new Error("Not authorized");
    const repo = await getActionRepoWithAccess(ctx, args.repoId);
    const token = await getRepoScopedInstallationToken(
      repo.installationId,
      { githubId: repo.githubId, name: repo.name },
      "write",
    );
    return { token };
  },
});

/** Lists all branches for a given repository via the GitHub API. */
export const listBranches = action({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(v.object({ name: v.string(), protected: v.boolean() })),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }
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
    const identity = await ctx.auth.getUserIdentity();
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }
    const accessState = await ctx.runQuery(installationAccessStateRef, {
      installationId: args.installationId,
    });
    if (accessState === "denied") {
      throw new Error("Not authorized to inspect this installation");
    }
    // `installationId` arrives from the browser and GitHub warns it can be
    // spoofed. An installation Octokit sees every repo the App is installed
    // on, including ones this user cannot access on GitHub. Always ask
    // GitHub what *this user's* token can see.
    return await listInstallationReposForUser(
      ctx,
      ctx.userId,
      args.installationId,
    );
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
    const identity = await ctx.auth.getUserIdentity();
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }
    const accessState = await ctx.runQuery(installationAccessStateRef, {
      installationId: args.installationId,
    });
    if (accessState === "denied") {
      throw new Error("Not authorized to inspect this installation");
    }
    await assertUserCanUseRepo(
      ctx,
      ctx.userId,
      args.installationId,
      args.owner,
      args.name,
    );
    const octokit = await getInstallationOctokit(args.installationId);
    return detectAppsForRepo(octokit, args.owner, args.name);
  },
});

/**
 * Adds a repo to Eva, verifying against GitHub when the installation is new.
 *
 * The GitHub-side check happens here rather than in the mutation because it
 * needs a network call: `assertUserCanUseRepo` asks GitHub whether *this user's*
 * token can see `owner/name` inside the installation. Without that, any signed-in
 * user could bind a row to an arbitrary installation id and then mint
 * installation tokens for it through `getInstallationTokenAction`.
 *
 * Always proves GitHub-side access for `owner/name`, including installations
 * Eva already knows — otherwise a teammate could bind any repo on that
 * installation and mint write tokens for it.
 */
export const connectRepo = authAction({
  args: {
    owner: v.string(),
    name: v.string(),
    installationId: v.number(),
    githubId: v.optional(v.number()),
    rootDirectory: v.optional(v.string()),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.id("githubRepos"),
  // Explicit annotation: the handler reaches back into `internal`, so inference
  // would have to resolve this action's own type to type itself.
  handler: async (ctx, args): Promise<Id<"githubRepos">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }
    const accessState = await ctx.runQuery(installationAccessStateRef, {
      installationId: args.installationId,
    });
    if (accessState === "denied") {
      throw new Error(
        "Not authorized to add repositories from this installation",
      );
    }
    const match = await assertUserCanUseRepo(
      ctx,
      ctx.userId,
      args.installationId,
      args.owner,
      args.name,
    );
    return await ctx.runMutation(
      internal._githubRepos.mutations.createForInstallation,
      { ...args, githubId: match.id, userId: ctx.userId },
    );
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
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
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
