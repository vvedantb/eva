import { v } from "convex/values";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  appSnapshotCommands,
  findEvaApp,
  parseEvaConfig,
  parseEvaMcpSummary,
  type EvaMcpServerSummary,
} from "./config";
import { findSiblingsOf } from "../_githubRepos/helpers";

function nonEmpty(commands: string[]): string[] | undefined {
  return commands.length > 0 ? commands : undefined;
}

/** Owner/name/installation and default branch the `.eva/` sync reads from. */
export const getSyncTarget = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.union(
    v.object({
      owner: v.string(),
      name: v.string(),
      installationId: v.number(),
      ref: v.string(),
      rootDirectory: v.optional(v.string()),
      // False while the repo has never synced a `.eva/config.json`.
      hasEvaConfig: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const repo = await ctx.db.get(args.repoId);
    if (!repo) return null;
    // A monorepo's root row is often disconnected while its app rows are
    // connected; the `.eva/` folder belongs to the whole GitHub repo, so any
    // connected app is enough.
    if (repo.connected === false) {
      const siblings = await findSiblingsOf(ctx.db, repo);
      if (siblings.every((row) => row.connected === false)) return null;
    }
    return {
      owner: repo.owner,
      name: repo.name,
      installationId: repo.installationId,
      ref: repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
      rootDirectory: repo.rootDirectory,
      hasEvaConfig: repo.evaConfig !== undefined,
    };
  },
});

/**
 * Writes the default branch's `.eva/` files into the Convex cache: the command
 * fields of every app row of the GitHub repo and of its snapshot configs.
 *
 * - No `config.json`: the repo is Convex-managed again; commands are untouched.
 * - Invalid `config.json`: the last good commands stay; the error is shown.
 * - An app row the file does not list keeps Convex-managed commands
 *   (`appListed: false`).
 * - Snapshot commands go to each app's own snapshot config (per app in Convex).
 */
export const applyEvaConfig = internalMutation({
  args: {
    owner: v.string(),
    name: v.string(),
    ref: v.string(),
    configText: v.union(v.string(), v.null()),
    mcpText: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const siblings = await ctx.db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", args.owner).eq("name", args.name),
      )
      .collect();
    if (siblings.length === 0) return null;

    if (args.configText === null) {
      for (const row of siblings) {
        if (row.evaConfig) await ctx.db.patch(row._id, { evaConfig: undefined });
      }
      return null;
    }

    const errors: string[] = [];
    let mcpServers: EvaMcpServerSummary[] = [];
    if (args.mcpText !== null) {
      const mcp = parseEvaMcpSummary(args.mcpText);
      if (mcp.ok) mcpServers = mcp.value;
      else errors.push(mcp.error);
    }

    const parsed = parseEvaConfig(args.configText);
    if (!parsed.ok) errors.push(parsed.error);
    const evaConfig: NonNullable<Doc<"githubRepos">["evaConfig"]> = {
      ref: args.ref,
      syncedAt: Date.now(),
      ...(errors.length > 0 ? { error: errors.join("\n") } : {}),
      mcpServers,
    };

    for (const row of siblings) {
      const app = parsed.ok
        ? findEvaApp(parsed.value, row.rootDirectory)
        : null;
      // A broken file keeps the last good commands and shows the error.
      if (!parsed.ok) {
        await ctx.db.patch(row._id, { evaConfig });
        continue;
      }
      // An app row the file does not list (a newly added app) keeps its
      // Convex-managed commands, but is still marked as part of a repo that
      // has the file, so the setup prompt does not show for it.
      if (!app) {
        await ctx.db.patch(row._id, {
          evaConfig: { ...evaConfig, appListed: false },
        });
        continue;
      }
      await ctx.db.patch(row._id, {
        evaConfig,
        startupCommands: nonEmpty(app.startup),
        backgroundCommands: nonEmpty(app.background),
        stopCommands: nonEmpty(app.stop),
        devCommand: app.dev?.command,
        devPort: app.dev?.port,
      });
      const snapshot = appSnapshotCommands(parsed.value, app);
      const snapshotConfigs = await ctx.db
        .query("repoSnapshots")
        .withIndex("by_repo", (q) => q.eq("repoId", row._id))
        .collect();
      for (const config of snapshotConfigs) {
        await ctx.db.patch(config._id, {
          buildCommands: nonEmpty(snapshot.build),
          seedCommands: nonEmpty(snapshot.seed),
          updatedAt: Date.now(),
        });
      }
    }
    return null;
  },
});
