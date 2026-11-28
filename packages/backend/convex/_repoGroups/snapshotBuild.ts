"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { SandboxHandle } from "../_sandbox/provider";
import { DRIVE_CACHE_WRITER } from "../_sandbox/driveCache";
import { execHandle, resolveSandboxContext } from "../_sandbox_runtime/helpers";
import {
  cloneRepoInto,
  createSandboxAndPrepareRepo,
  EPHEMERAL_LIFECYCLE,
  installDependencies as runDependencyInstall,
} from "../_sandbox_runtime/git";
import { detectPackageManager } from "../_sandbox_runtime/devServer";
import {
  WORKSPACE_ROOT,
  linkedRepoDir,
  primaryLinkPath,
} from "../_sandbox_runtime/workspaceLayout";
import {
  computeRepoGroupFingerprint,
  type GroupForBuildResult,
} from "./snapshot";
import { errorMessage } from "@vvedantb/server";

const BUILDER_SANDBOX_READY_TIMEOUT_SECONDS = 180;

const MAX_LINKED_REPOS_TO_INSTALL = 3;

const CLONE_TIMEOUT_SECONDS = 300;

function logBuild(message: string): void {
  console.log(`[repoGroups][snapshot] ${message}`);
}

async function cloneLinkedRepo(
  sandbox: SandboxHandle,
  installationId: number,
  owner: string,
  name: string,
  branch: string,
  destDir: string,
): Promise<void> {
  const repoUrl = `https://github.com/${owner}/${name}.git`;
  logBuild(`cloning ${owner}/${name}@${branch} into ${destDir}`);
  await cloneRepoInto(sandbox, installationId, owner, name, destDir);
  await execHandle(
    sandbox,
    `git -C ${destDir} checkout ${branch} 2>/dev/null || git -C ${destDir} checkout -b ${branch} origin/${branch}`,
    CLONE_TIMEOUT_SECONDS,
    "/",
  );
  await execHandle(
    sandbox,
    `git -C ${destDir} remote set-url origin ${repoUrl}`,
    15,
    "/",
  );
}

/**
 * Builds (or refreshes) a codebase group's seeded snapshot. No-ops when the
 * group's inputs have not changed since the last successful build, or when
 * the primary repo has no seeded snapshot of its own yet to boot from.
 * Best-effort end to end: any failure is logged and leaves the group's
 * existing `seededSnapshotName` / `seededFingerprint` untouched (keep-last-good).
 */
export const buildGroupSnapshot = internalAction({
  args: { groupId: v.id("repoGroups") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const build: GroupForBuildResult = await ctx.runQuery(
      internal.repoGroups.getGroupForBuild,
      { groupId: args.groupId },
    );
    if (!build) {
      logBuild(`group ${args.groupId} or its primary repo no longer exists; skipping`);
      return null;
    }
    const { group, primary, linked } = build;
    if (!primary.seededSnapshotName) {
      logBuild(
        `group ${args.groupId}: primary repo ${primary.owner}/${primary.name} has no seeded snapshot yet; skipping`,
      );
      return null;
    }

    const installDependencies = group.installDependencies !== false;
    const fingerprint = computeRepoGroupFingerprint({
      primarySeededSnapshotName: primary.seededSnapshotName,
      members: linked.map((repo) => ({
        repoId: String(repo.repoId),
        defaultBaseBranch: repo.defaultBaseBranch,
      })),
      installDependencies,
    });

    if (fingerprint === group.seededFingerprint && group.seededSnapshotName) {
      logBuild(
        `group ${args.groupId}: snapshot already current (fingerprint ${fingerprint}); skipping`,
      );
      return null;
    }

    let sandbox: SandboxHandle | undefined;
    try {
      const { client, sandboxEnvVars, snapshotName } = await resolveSandboxContext(
        ctx,
        group.primaryRepoId,
      );
      const created = await createSandboxAndPrepareRepo(
        ctx,
        client,
        primary.installationId,
        primary.owner,
        primary.name,
        sandboxEnvVars,
        EPHEMERAL_LIFECYCLE,
        snapshotName,
        undefined,
        undefined,
        { mode: "none" },
        BUILDER_SANDBOX_READY_TIMEOUT_SECONDS,
        true,
        undefined,
        DRIVE_CACHE_WRITER,
      );
      sandbox = created.sandbox;

      const skipInstalls = linked.length > MAX_LINKED_REPOS_TO_INSTALL;
      if (skipInstalls) {
        logBuild(
          `group ${args.groupId}: ${linked.length} linked repos (> ${MAX_LINKED_REPOS_TO_INSTALL}); skipping dependency installs to stay inside the action's 10-minute ceiling`,
        );
      }

      await execHandle(sandbox, `mkdir -p ${WORKSPACE_ROOT}`, 15, "/");
      await execHandle(
        sandbox,
        `ln -sfn /tmp/repo ${primaryLinkPath(primary.name)}`,
        15,
        "/",
      );

      for (const repo of linked) {
        const destDir = linkedRepoDir(repo.name);
        await cloneLinkedRepo(
          sandbox,
          repo.installationId,
          repo.owner,
          repo.name,
          repo.defaultBaseBranch,
          destDir,
        );
        if (installDependencies && !skipInstalls) {
          const pm = await detectPackageManager(sandbox, "", destDir);
          logBuild(
            `group ${args.groupId}: installing ${repo.owner}/${repo.name} dependencies with ${pm}`,
          );
          await runDependencyInstall(sandbox, pm, destDir);
        }
      }

      const label = `group-${args.groupId}-${fingerprint.slice(0, 12)}`;
      logBuild(`group ${args.groupId}: capturing snapshot ${label}`);
      const { snapshotId } = await sandbox.createSnapshot({ name: label });

      await ctx.runMutation(internal.repoGroups.setGroupSeededSnapshot, {
        groupId: args.groupId,
        seededSnapshotName: snapshotId,
        seededFingerprint: fingerprint,
      });
      logBuild(
        `group ${args.groupId}: snapshot ${snapshotId} stored (fingerprint ${fingerprint})`,
      );
    } catch (e) {
      logBuild(
        `build failed for group ${args.groupId}: ${errorMessage(e)}`,
      );
    } finally {
      if (sandbox) {
        try {
          await sandbox.delete();
        } catch (e) {
          logBuild(
            `failed to delete ephemeral builder sandbox for group ${args.groupId}: ${
              errorMessage(e)
            }`,
          );
        }
      }
    }
    return null;
  },
});
