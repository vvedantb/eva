"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { getInstallationOctokit, getInstallationToken } from "../githubAuth";
import { detectAppsForRepo } from "./helpers";
import { authAction, getActionRepoWithAccess } from "../functions";
import {
  assertUserCanUseRepo,
  INSTALLATION_NOT_AUTHORIZED,
  listInstallationReposForUser,
} from "./userAuth";

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
  args: { repoId: v.id("githubRepos") },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const repo = await getActionRepoWithAccess(ctx, args.repoId);
    const token = await getInstallationToken(repo.installationId);
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
      throw new Error(INSTALLATION_NOT_AUTHORIZED);
    }
    // No Eva row for this installation yet, so there is nothing on our side that
    // could have authorized the caller. `installationId` arrives from the
    // browser and GitHub warns it can be spoofed, so the only sound check is to
    // ask GitHub what *this user's* token can see in that installation.
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
      throw new Error(INSTALLATION_NOT_AUTHORIZED);
    }
    // Same reasoning as listRepos: with no Eva row backing the installation, the
    // caller's own GitHub token is the only thing that can vouch for them.
    if (accessState === "unclaimed") {
      await assertUserCanUseRepo(
        ctx,
        ctx.userId,
        args.installationId,
        args.owner,
        args.name,
      );
    }
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
 * Installations Eva already knows the caller can use skip the round trip, so
 * adding a second repo from an installation never re-prompts for authorization.
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
        ctx.userId,
        args.installationId,
        args.owner,
        args.name,
      );
    }
    return await ctx.runMutation(
      internal._githubRepos.mutations.createForInstallation,
      { ...args, userId: ctx.userId },
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
