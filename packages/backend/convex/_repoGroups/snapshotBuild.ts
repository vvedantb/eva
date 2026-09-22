"use node";

/**
 * Group seeded snapshots — BUILD step. Boots an ephemeral sandbox from the
 * primary repo's own seeded snapshot, clones every linked repo alongside it
 * under `/tmp/workspace/<name>` (installing dependencies), captures the whole
 * filesystem into one `snap_*`, and stores it on the group. Sessions created
 * from the group then boot straight from this snapshot instead of paying the
 * clone + install cost for every linked repo on every fresh sandbox — see
 * `getGroupSnapshotForBoot` / `resolveSandboxContext`.
 *
 * The clone and install steps are the same ones a live session's
 * `prepareLinkedRepo` runs (`cloneRepoInto` +
 * `detectPackageManager`/`installDependencies`), so a repo that clones and
 * installs in a session behaves identically when baked into a group snapshot.
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { SandboxHandle } from "../_sandbox/provider";
import { execHandle, resolveSandboxContext } from "../_sandbox_runtime/helpers";
import {
  cloneRepoInto,
  createSandboxAndPrepareRepo,
  EPHEMERAL_LIFECYCLE,
  // Aliased: `installDependencies` is also this module's local name for the
  // group's own install-or-not flag.
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

// Large seeded snapshots take well over the SDK's 30s default to boot the
// ephemeral builder sandbox — mirrors createSeedPrepSandbox's readyTimeoutSeconds.
const BUILDER_SANDBOX_READY_TIMEOUT_SECONDS = 180;

// Every convex action has a hard 600s ceiling. Cloning + installing more than
// a handful of repos serially risks blowing through it, so installs (the slow
// part) are skipped past this count — the snapshot still carries the clones,
// just without warm node_modules.
const MAX_LINKED_REPOS_TO_INSTALL = 3;

const CLONE_TIMEOUT_SECONDS = 300;

function logBuild(message: string): void {
  console.log(`[repoGroups][snapshot] ${message}`);
}

/**
 * Clones one linked repo into `destDir` on `branch`. `cloneRepoInto` mints a
 * one-off installation token and does not install the sandbox's global git
 * credential helper, which is what this ephemeral builder wants — it is
 * deleted right after the capture. The token is stripped from the `origin`
 * remote immediately afterwards so it is never baked into the captured
 * snapshot's filesystem.
 */
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
  // Plain `git clone` fetches every branch as a remote-tracking ref, so the
  // target branch (if different from whatever HEAD defaulted to) is already
  // available locally — no second authenticated network call needed.
  await execHandle(
    sandbox,
    `git -C ${destDir} checkout ${branch} 2>/dev/null || git -C ${destDir} checkout -b ${branch} origin/${branch}`,
    CLONE_TIMEOUT_SECONDS,
    "/",
  );
  // Never leave the transient token sitting in `.git/config` — the snapshot's
  // filesystem is what gets captured next.
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
        undefined, // onSandboxAcquired
        undefined, // onProgress
        { mode: "none" }, // syncStrategy — this builder is thrown away, no need to sync
        BUILDER_SANDBOX_READY_TIMEOUT_SECONDS,
        true, // skipInstallDeps — primary already carries its own deps
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
        `build failed for group ${args.groupId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      if (sandbox) {
        try {
          await sandbox.delete();
        } catch (e) {
          logBuild(
            `failed to delete ephemeral builder sandbox for group ${args.groupId}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }
    }
    return null;
  },
});
