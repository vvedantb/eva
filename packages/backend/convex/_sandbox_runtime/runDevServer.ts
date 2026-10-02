"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { resolveSandboxContext } from "./helpers";
import { launchDevServerInBackground } from "./devServer";
import { startServicesWithRestoreAlert } from "./sessions";

/**
 * Re-runs the app dev server inside an active task sandbox using the repo's
 * App settings (dev command / port overrides, else package.json detection).
 */
export const runDevServerInTaskSandbox = internalAction({
  args: {
    taskId: v.id("agentTasks"),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) {
      throw new Error("Repository not found");
    }

    const rootDir = repo.rootDirectory ?? "";
    const { client } = await resolveSandboxContext(ctx, args.repoId);
    const handle = await client.get(args.sandboxId);

    const { port: devPort, devCommand } = await startServicesWithRestoreAlert(
      ctx,
      args.taskId,
      handle,
      rootDir,
      repo,
    );

    await launchDevServerInBackground(handle, devCommand, devPort);

    await ctx.runMutation(internal._agentTasks.sandbox.patchTaskDevServer, {
      taskId: args.taskId,
      devPort,
      devCommand,
    });

    return null;
  },
});
