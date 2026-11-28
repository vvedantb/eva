"use node";

import { v } from "convex/values";
import type { GenericActionCtx } from "convex/server";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import { execHandle, getSandboxHandle } from "./helpers";
import { sandboxStillWanted } from "./execution";
import {
  cloneRepoInto,
  installDependencies,
  installPythonDependencies,
  runLoggedGitStep,
} from "./git";
import { detectPackageManager } from "./devServer";
import { ensureGitCredentialHelper } from "./gitCredentials";
import { writeSandboxFile } from "./sandboxFiles";
import { linkedRepoDir, primaryLinkPath } from "./workspaceLayout";
import { formatEnvFile } from "./envFile";
import {
  branchExistsRemoteCommand,
  freshCloneCheckoutCommand,
  resumeCheckoutCommand,
} from "./linkedRepoBranch";
import { launchLinkedRepoDevServerInVercelConsole } from "../_pty/launchDevServerInVercelConsole";
import { resolveEnvVars } from "../envVarResolver";
import { type ProgressStep, startupProgress } from "./startupProgress";
import { sandboxOwnerKey, sandboxStartupEntityId } from "@eva/shared";

type ActionCtx = GenericActionCtx<DataModel>;

function logLinkedRepo(message: string): void {
  console.log(`[sandbox][linkedRepos] ${message}`);
}

async function setLinkedRepoProgress(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  steps: ProgressStep[],
): Promise<void> {
  await ctx.runMutation(internal.streaming.internalSet, {
    entityId: sandboxStartupEntityId({ kind: "session", sessionId }),
    currentActivity: JSON.stringify(steps),
  });
}

/**
 * Clones (fresh sandbox) or catches up (resumed sandbox) one linked repo,
 * installs its dependencies on first clone, and writes its own `.env.eva`.
 * Errors propagate — the caller (`sessionSandboxStartupWorkflow`) still
 * clears the session's setup-pending gate and posts a system alert naming
 * this repo, so one broken linked repo never wedges the whole session.
 */
export const prepareLinkedRepo = internalAction({
  args: {
    sessionId: v.id("sessions"),
    sessionRepoId: v.id("sessionRepos"),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const details = `sessionId=${args.sessionId}, sessionRepoId=${args.sessionRepoId}`;
    await runLoggedGitStep("prepareLinkedRepo", details, async () => {
      const [row, primaryRepo, stillWanted] = await Promise.all([
        ctx.runQuery(internal.sessions.getSessionRepoInternal, {
          id: args.sessionRepoId,
        }),
        ctx.runQuery(internal.githubRepos.getInternal, { id: args.repoId }),
        sandboxStillWanted(ctx, args.sandboxId, args.sessionId),
      ]);
      if (!row) {
        logLinkedRepo(
          `prepareLinkedRepo: sessionRepos row gone, skipping (${details})`,
        );
        return;
      }
      if (!primaryRepo) {
        throw new Error(
          `prepareLinkedRepo: primary repo ${args.repoId} not found`,
        );
      }
      if (!stillWanted) {
        logLinkedRepo(
          `prepareLinkedRepo: sandbox stopped, skipping (${details})`,
        );
        return;
      }
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);

      await execHandle(
        sandbox,
        `mkdir -p /tmp/workspace && ln -sfn /tmp/repo ${primaryLinkPath(primaryRepo.name)}`,
        10,
        "/",
      );

      await ensureGitCredentialHelper(
        ctx,
        sandbox,
        primaryRepo.installationId,
        { owner: primaryRepo.owner, name: primaryRepo.name },
        [row.installationId],
      );

      const hasGitDir =
        (
          await execHandle(
            sandbox,
            `test -d ${linkedRepoDir(row.name)}/.git && echo yes || echo no`,
            10,
            "/",
          )
        ).trim() === "yes";
      const freshlyCloned = !hasGitDir;
      const completed: ProgressStep[] = [];
      const cloneLabel = `Cloning ${row.name}...`;
      const installLabel = `Installing ${row.name} dependencies...`;
      const plan =
        freshlyCloned && row.installDependencies
          ? [cloneLabel, installLabel]
          : [cloneLabel];
      await setLinkedRepoProgress(
        ctx,
        args.sessionId,
        startupProgress(completed, cloneLabel, plan),
      );
      if (!hasGitDir) {
        await cloneRepoInto(
          sandbox,
          row.installationId,
          row.owner,
          row.name,
          row.path,
        );
        const branchExistsRemotely =
          (
            await execHandle(
              sandbox,
              branchExistsRemoteCommand(row.path, row.branchName),
              30,
              "/",
            )
          ).trim().length > 0;
        await execHandle(
          sandbox,
          freshCloneCheckoutCommand(
            row.path,
            row.branchName,
            row.baseBranch,
            branchExistsRemotely,
          ),
          30,
          "/",
        );
      } else {
        await execHandle(
          sandbox,
          `cd ${row.path} && git fetch origin ${row.baseBranch}`,
          120,
          "/",
        );
        const branchExistsLocally =
          (
            await execHandle(
              sandbox,
              `cd ${row.path} && git show-ref --verify --quiet refs/heads/${row.branchName} && echo yes || echo no`,
              10,
              "/",
            )
          ).trim() === "yes";
        await execHandle(
          sandbox,
          resumeCheckoutCommand(
            row.path,
            row.branchName,
            row.baseBranch,
            branchExistsLocally,
          ),
          30,
          "/",
        );
      }
      completed.push({ type: "tool", label: cloneLabel, status: "complete" });

      if (row.installDependencies) {
        const hasNodeModules =
          (
            await execHandle(
              sandbox,
              `test -d ${row.path}/node_modules && echo yes || echo no`,
              10,
              "/",
            )
          ).trim() === "yes";
        if (!hasNodeModules) {
          await setLinkedRepoProgress(
            ctx,
            args.sessionId,
            startupProgress(completed, installLabel, plan),
          );
          const pm = await detectPackageManager(sandbox, "", row.path);
          logLinkedRepo(
            `prepareLinkedRepo: detected package manager "${pm}" for ${row.owner}/${row.name}`,
          );
          await installDependencies(sandbox, pm, row.path);
          await installPythonDependencies(sandbox, row.path);
          completed.push({
            type: "tool",
            label: installLabel,
            status: "complete",
          });
        }
      }
      await setLinkedRepoProgress(ctx, args.sessionId, completed);

      const envVars = await resolveEnvVars(ctx, row.repoId);
      const envFileContent = formatEnvFile(envVars);
      if (envFileContent) {
        const envPath = `${row.path}/.env.eva`;
        await writeSandboxFile(sandbox, envPath, envFileContent);
        await execHandle(sandbox, `chmod 600 ${envPath}`, 10, "/");
      }

      await ctx.runMutation(internal.sessions.patchSessionRepo, {
        id: row._id,
        clonedAt: Date.now(),
      });

      if (freshlyCloned && row.devCommand && row.devPort !== undefined) {
        await launchLinkedRepoDevServerInVercelConsole(
          sandbox,
          `${sandboxOwnerKey({ kind: "session", sessionId: args.sessionId })}-${row.name}`,
          row.path,
          row.devCommand,
          row.devPort,
        );
      }
    });
    return null;
  },
});
