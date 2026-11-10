"use node";

import { Sandbox } from "@vercel/sandbox";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { resolveSandboxCredentialsOnly } from "./envVarResolver";

/**
 * Leak sweep: stops Vercel VMs that run while every Eva owner is `closed`.
 *
 * The Vercel SDK resumes a stopped sandbox on any exec, so a background job
 * that runs a command after Stop wakes the VM again. The owner row still says
 * `closed`, and idle pause only scans `active` rows, so nothing stopped it.
 * This sweep asks Vercel which VMs run and stops the ones Eva does not want.
 *
 * Shares `appSettings.sandboxIdlePauseMode`: `off` does nothing, `dry-run`
 * logs `[sandboxLeakSweep] would-stop …`, `on` stops the VM.
 */

/** A VM must have been running this long first, so a start in flight is never raced. */
const MIN_RUNNING_MS = 3 * 60_000;

export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { mode } = await ctx.runQuery(
      internal.sandboxIdlePause.getSettingsInternal,
      {},
    );
    if (mode === "off") return null;

    const repoIds = await ctx.runQuery(
      internal.sandboxCleanup.listGithubRepoIds,
      {},
    );
    const now = Date.now();
    const projectsSeen = new Set<string>();
    const running = new Set<string>();
    for (const repoId of repoIds) {
      try {
        const credentials = await resolveSandboxCredentialsOnly(ctx, repoId);
        const projectKey = `${credentials.teamId}:${credentials.projectId}`;
        if (projectsSeen.has(projectKey)) continue;
        projectsSeen.add(projectKey);
        const list = await Sandbox.list({
          token: credentials.token,
          teamId: credentials.teamId,
          projectId: credentials.projectId,
        });
        for await (const sandbox of list) {
          if (sandbox.status !== "running") continue;
          const since = sandbox.statusUpdatedAt ?? sandbox.updatedAt;
          if (now - since < MIN_RUNNING_MS) continue;
          running.add(sandbox.name);
        }
      } catch (error) {
        console.warn(
          `[sandboxLeakSweep] skip repo=${repoId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const leaked = await ctx.runQuery(
      internal.sandboxIdlePause.listLeakedSandboxes,
      { sandboxIds: [...running] },
    );
    const verb = mode === "on" ? "stop" : "would-stop";
    for (const { sandboxId, repoId } of leaked) {
      console.log(
        `[sandboxLeakSweep] ${verb} sandbox=${sandboxId} repo=${repoId}`,
      );
      if (mode !== "on") continue;
      // Same action the Stop button finalizes with; it never throws on a
      // VM that is already gone or stopped.
      await ctx.runAction(internal.sandbox.stopSandbox, { sandboxId, repoId });
    }
    console.log(
      `[sandboxLeakSweep] sweep mode=${mode} projects=${projectsSeen.size} running=${running.size} ${mode === "on" ? "stopped" : "would-stop"}=${leaked.length}`,
    );
    return null;
  },
});
