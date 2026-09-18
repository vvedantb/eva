"use node";

/**
 * Provisions one `sessionRepos` row into its slot under `/tmp/workspace` —
 * the sandbox-side half of "multi-repo sessions" (see `workspaceLayout.ts`
 * and `_sessions/repos.ts` for the shared concept). Runs once per linked
 * repo, sequentially, from `sessionSandboxStartupWorkflow` after the primary
 * sandbox is up; the workflow clears `sandboxSetupPending` once every row has
 * been attempted (success or failure), so a linked repo can never wedge the
 * first turn forever.
 */

import { v } from "convex/values";
import type { GenericActionCtx } from "convex/server";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import { execHandle, getSandboxHandle } from "./helpers";
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

type ActionCtx = GenericActionCtx<DataModel>;

function logLinkedRepo(message: string): void {
  console.log(`[sandbox][linkedRepos] ${message}`);
}

type ProgressStep = {
  type: "tool";
  label: string;
  status: "active" | "complete";
};

/** Streams clone/install progress for one linked repo onto the session's startup timeline. */
async function setLinkedRepoProgress(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  steps: ProgressStep[],
): Promise<void> {
  await ctx.runMutation(internal.streaming.internalSet, {
    entityId: `session-startup-${sessionId}`,
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
    /** The primary repo, for resolving sandbox credentials. */
    repoId: v.id("githubRepos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const details = `sessionId=${args.sessionId}, sessionRepoId=${args.sessionRepoId}`;
    await runLoggedGitStep("prepareLinkedRepo", details, async () => {
      const row = await ctx.runQuery(
        internal.sessions.getSessionRepoInternal,
        { id: args.sessionRepoId },
      );
      if (!row) {
        logLinkedRepo(
          `prepareLinkedRepo: sessionRepos row gone, skipping (${details})`,
        );
        return;
      }
      const primaryRepo = await ctx.runQuery(internal.githubRepos.getInternal, {
        id: args.repoId,
      });
      if (!primaryRepo) {
        throw new Error(
          `prepareLinkedRepo: primary repo ${args.repoId} not found`,
        );
      }
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);

      // 1. The workspace root + the primary's symlink into it. Idempotent —
      // every linked repo's prep re-asserts the same link.
      await execHandle(
        sandbox,
        `mkdir -p /tmp/workspace && ln -sfn /tmp/repo ${primaryLinkPath(primaryRepo.name)}`,
        10,
        "/",
      );

      // 2. Credentials: linked repos can live under a different GitHub App
      // installation than the primary, so the helper must mint tokens for both.
      await ensureGitCredentialHelper(
        ctx,
        sandbox,
        primaryRepo.installationId,
        { owner: primaryRepo.owner, name: primaryRepo.name },
        [row.installationId],
      );

      const completed: ProgressStep[] = [];
      const cloneLabel = `Cloning ${row.name}...`;
      await setLinkedRepoProgress(ctx, args.sessionId, [
        ...completed,
        { type: "tool", label: cloneLabel, status: "active" },
      ]);

      // 3. Clone (fresh sandbox) or catch the existing clone up to the base
      // branch and make sure the session branch is checked out (resumed
      // sandbox — this row was already cloned in a previous run).
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

      // 4. Dependencies, once — only when this clone has never installed them.
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
          const installLabel = `Installing ${row.name} dependencies...`;
          await setLinkedRepoProgress(ctx, args.sessionId, [
            ...completed,
            { type: "tool", label: installLabel, status: "active" },
          ]);
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

      // 5. This repo's own env vars, written at its own clone root — never
      // merged into the sandbox-wide env file.
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

      // 6. Dev server, if this row configures one. The primary's dev server
      // (launched earlier in `prepareSessionSandboxInternal`) never reaches
      // this repo since it wasn't cloned yet at that point — this is the
      // first point in the fresh-create flow where it can actually start.
      // Only on a fresh clone: a resumed sandbox already relaunched every
      // cloned row's server in `reuseSessionSandbox`, and
      // `launchDevServerInVercelConsole` reuses an existing tmux session, so
      // a second call would start a duplicate process in the same window.
      if (freshlyCloned && row.devCommand && row.devPort !== undefined) {
        await launchLinkedRepoDevServerInVercelConsole(
          sandbox,
          `session-${args.sessionId}-${row.name}`,
          row.path,
          row.devCommand,
          row.devPort,
        );
      }
    });
    return null;
  },
});
