"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { resolveSandboxContext } from "./helpers";
import { launchDevServerInBackground } from "./devServer";
import { startServicesWithRestoreAlert } from "./sessions";

/**
 * Re-runs the app dev server inside an active sandbox using the repo's App
 * settings (dev command / port overrides, else package.json detection), then
 * stores the resolved port and command on the sandbox's owner: a project
 * task's own row, or a session (a quick task's sandbox lives on its session).
 */
export const runDevServerInSandbox = internalAction({
  args: {
    owner: v.union(
      v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
      v.object({ kind: v.literal("session"), sessionId: v.id("sessions") }),
    ),
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

    const { owner } = args;
    const { port: devPort, devCommand } = await startServicesWithRestoreAlert(
      ctx,
      owner.kind === "task" ? owner.taskId : owner.sessionId,
      handle,
      rootDir,
      repo,
    );

    await launchDevServerInBackground(handle, devCommand, devPort);

    if (owner.kind === "task") {
      await ctx.runMutation(internal._agentTasks.sandbox.patchTaskDevServer, {
        taskId: owner.taskId,
        devPort,
        devCommand,
      });
    } else {
      await ctx.runMutation(internal.sessions.patchSessionDevServer, {
        sessionId: owner.sessionId,
        devPort,
        devCommand,
      });
    }
    return null;
  },
});
