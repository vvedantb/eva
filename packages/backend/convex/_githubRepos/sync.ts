import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { hasRepoReferences, normalizePath } from "../repoUtils";
import { findReposByOwnerAndName } from "./helpers";

/** Inserts or updates a GitHub repo entry, matching by GitHub ID or owner/name. */
export const upsert = internalMutation({
  args: {
    owner: v.string(),
    name: v.string(),
    installationId: v.number(),
    githubId: v.optional(v.number()),
    teamId: v.optional(v.id("teams")),
    rootDirectory: v.optional(v.string()),
    parentRepoId: v.optional(v.id("githubRepos")),
  },
  returns: v.id("githubRepos"),
  handler: async (ctx, args) => {
    const normalizedRoot = args.rootDirectory
      ? normalizePath(args.rootDirectory)
      : undefined;

    const matchesRoot = (r: Doc<"githubRepos">) =>
      r.rootDirectory === normalizedRoot;

    let existing: Doc<"githubRepos"> | undefined;

    if (args.githubId !== undefined) {
      const byGithubId = await ctx.db
        .query("githubRepos")
        .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
        .collect();
      existing = byGithubId.find(matchesRoot);
    }

    if (!existing) {
      const byOwnerName = await findReposByOwnerAndName(ctx.db, args);
      existing = byOwnerName.find(matchesRoot);
    }

    if (existing) {
      const updates: Record<
        string,
        string | number | boolean | Id<"teams"> | Id<"githubRepos">
      > = {
        connected: true,
      };
      if (args.teamId && !existing.teamId) {
        updates.teamId = args.teamId;
      }
      if (existing.installationId !== args.installationId) {
        updates.installationId = args.installationId;
      }
      if (existing.owner !== args.owner) {
        updates.owner = args.owner;
      }
      if (existing.name !== args.name) {
        updates.name = args.name;
      }
      if (args.githubId !== undefined && existing.githubId === undefined) {
        updates.githubId = args.githubId;
      }
      if (
        args.parentRepoId !== undefined &&
        existing.parentRepoId === undefined
      ) {
        updates.parentRepoId = args.parentRepoId;
      }
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("githubRepos", {
      owner: args.owner,
      name: args.name,
      installationId: args.installationId,
      githubId: args.githubId,
      connected: true,
      teamId: args.teamId,
      rootDirectory: normalizedRoot,
      parentRepoId: args.parentRepoId,
      defaultBaseBranch: "staging",
    });
  },
});

/** Updates the connected flag on all repos, marking only the provided IDs as connected. */
export const syncConnectedStatus = internalMutation({
  args: { connectedIds: v.array(v.id("githubRepos")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connectedSet = new Set(args.connectedIds);
    const all = await ctx.db.query("githubRepos").collect();

    for (const repo of all) {
      const shouldBeConnected = connectedSet.has(repo._id);
      if (repo.connected !== shouldBeConnected) {
        await ctx.db.patch(repo._id, { connected: shouldBeConnected });
      }
    }
    return null;
  },
});

/** Deletes sub-app repo entries that are no longer detected in the monorepo and have no references. */
export const cleanupStaleSubApps = internalMutation({
  args: {
    detectedApps: v.array(
      v.object({
        owner: v.string(),
        name: v.string(),
        paths: v.array(v.string()),
      }),
    ),
  },
  returns: v.object({ deletedCount: v.number() }),
  handler: async (ctx, args) => {
    let deletedCount = 0;

    for (const entry of args.detectedApps) {
      const normalizedPaths = new Set(
        entry.paths
          .map((p) => normalizePath(p))
          .filter((p): p is string => p !== undefined),
      );

      const rows = await findReposByOwnerAndName(ctx.db, entry);

      const subAppRows = rows.filter((r) => r.rootDirectory !== undefined);

      for (const row of subAppRows) {
        if (normalizedPaths.has(row.rootDirectory ?? "")) continue;
        if (row.connected === true) continue;
        if (row.connectedBy !== undefined) continue;

        const referenced = await hasRepoReferences(ctx, row._id);
        if (referenced) continue;

        await ctx.db.delete(row._id);
        deletedCount++;
      }
    }

    return { deletedCount };
  },
});

/** Deletes root repo entries for monorepos (repos that have sub-apps) if unreferenced. */
export const cleanupMonorepoRoots = internalMutation({
  args: {
    monorepos: v.array(
      v.object({
        owner: v.string(),
        name: v.string(),
      }),
    ),
  },
  returns: v.object({ deletedCount: v.number() }),
  handler: async (ctx, args) => {
    let deletedCount = 0;

    for (const entry of args.monorepos) {
      const rows = await findReposByOwnerAndName(ctx.db, entry);

      const rootRow = rows.find((r) => r.rootDirectory === undefined);
      if (!rootRow) continue;
      if (rootRow.connected === true) continue;
      if (rootRow.connectedBy !== undefined) continue;

      const referenced = await hasRepoReferences(ctx, rootRow._id);
      if (referenced) continue;

      await ctx.db.delete(rootRow._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});
