import { v } from "convex/values";
import { internal } from "./_generated/api";
import { workflow } from "./workflowManager";
import {
  isTerminalSnapshotState,
  type SnapshotState,
} from "./_sandbox_runtime/snapshotStates";
import { errorMessage } from "@vvedantb/server";

const SEED_RUN_POLL_DELAY_MS = 20_000;
const MAX_SEED_RUN_POLLS = 150;

const SEED_SNAPSHOT_POLL_DELAY_MS = 15_000;
const MAX_SEED_SNAPSHOT_POLLS = 240;

function formatPollElapsed(pollAttempt: number): string {
  const totalSeconds = Math.round(
    (pollAttempt * SEED_RUN_POLL_DELAY_MS) / 1000,
  );
  if (totalSeconds < 90) return `${totalSeconds}s`;
  return `${Math.round(totalSeconds / 60)}m`;
}

/**
 * Snapshot build workflow — app-specific seeded snapshot model.
 *
 * Each app's snapshot is built independently: clone → install toolchain +
 * deps → run the app's own seed commands (daemons, seed:sql, etc.) → capture
 * ONE `snap_*` and store it on that app's repoSnapshots.seededSnapshotName.
 * Each app boots from its own snapshot (code/deps are present; own Convex
 * cold-starts on first use).
 *
 *   1. resolve this app's snapshot config (repoSnapshotId → config.repoId)
 *   2. check if the app has Stop Commands; if not, build base Image only
 *   3. if seeding: boot ONE fresh seed-prep sandbox from the app's config
 *   4. fetch latest refs (fetchBaseBranch owns git auth)
 *   5. run ONE detached script (launchSeedRun): toolchain + config files
 *      (Vercel only) → git reset → install → daemons → app seed commands →
 *      marker → clean stop; the workflow polls its markers
 *   6. capture ONE snapshot (per this app), poll to active, store on this
 *      app's seededSnapshotName
 *   7. stop/delete the prep sandbox (best-effort safety net)
 *
 * No warmup step: the first user sandbox created from the new snapshot pays
 * the cold-boot cost directly. The declarative Image build remains ONLY as
 * the bootstrap / toolchain-change path, behind forceImageRebuild.
 */
export const snapshotBuildWorkflow = workflow.define({
  args: {
    buildId: v.id("snapshotBuilds"),
    repoSnapshotId: v.id("repoSnapshots"),
    appRepoId: v.optional(v.id("githubRepos")),
    forceImageRebuild: v.optional(v.boolean()),
  },
  handler: async (step, args) => {
    const snapshotOwner = await step.runQuery(
      internal.repoSnapshots.getRepoSnapshotInternal,
      { repoSnapshotId: args.repoSnapshotId },
    );
    if (snapshotOwner) {
      await step.runAction(internal._evaConfig.sync.syncEvaConfig, {
        repoId: snapshotOwner.repoId,
      });
    }

    const config = await step.runQuery(
      internal.repoSnapshots.getRepoSnapshotInternal,
      { repoSnapshotId: args.repoSnapshotId },
    );
    if (!config) {
      await step.runMutation(internal.repoSnapshots.completeBuild, {
        buildId: args.buildId,
        status: "error",
        logs: "",
        error: "Snapshot config not found",
      });
      return;
    }
    const appRepoId = args.appRepoId ?? config.repoId;
    const repo = await step.runQuery(internal.repoSnapshots.getRepo, {
      repoId: appRepoId,
    });
    if (!repo) {
      await step.runMutation(internal.repoSnapshots.completeBuild, {
        buildId: args.buildId,
        status: "error",
        logs: "",
        error: "GitHub repo not found",
      });
      return;
    }
    const branch = config.branch;

    const hasStopCommands = (repo.stopCommands?.length ?? 0) > 0;
    const imageOnlyBuild = !hasStopCommands && args.forceImageRebuild !== true;
    const rebuildBaseImage = args.forceImageRebuild === true || imageOnlyBuild;
    if (imageOnlyBuild) {
      await step.runMutation(internal.repoSnapshots.appendLogs, {
        buildId: args.buildId,
        chunk:
          "No Stop Commands configured on this app (add them to enable seeded snapshots). Rebuilding base Image snapshot only.\n",
      });
    }

    let rebuiltBaseSnapshotId: string | undefined;
    if (rebuildBaseImage) {
      const baseSnapshotLabel = `base-${config.repoId}`;
      let prepSandboxId: string | null = null;
      const previousBaseSnapshotId = config.baseSnapshotId ?? null;

      await step.runMutation(internal.repoSnapshots.appendLogs, {
        buildId: args.buildId,
        chunk:
          "Vercel base Image build: fresh sandbox → toolchain + pnpm install + build commands → snap_* capture...\n",
      });

      try {
        const created = await step.runAction(
          internal.snapshotActions.createSeedPrepSandbox,
          { repoId: appRepoId },
          { retry: { maxAttempts: 4, initialBackoffMs: 15000, base: 2 } },
        );
        if (!created.ok) {
          await step.runMutation(internal.repoSnapshots.completeBuild, {
            buildId: args.buildId,
            status: "error",
            logs: "",
            error: created.error,
          });
          return;
        }
        prepSandboxId = created.sandboxId;

        await step.runAction(
          internal.sandbox.fetchBaseBranch,
          {
            sandboxId: prepSandboxId,
            installationId: repo.installationId,
            repoOwner: repo.owner,
            repoName: repo.name,
            baseBranch: branch,
            repoId: appRepoId,
          },
          { retry: { maxAttempts: 3, initialBackoffMs: 10000, base: 2 } },
        );

        await step.runAction(
          internal.snapshotActions.launchSeedRun,
          {
            sandboxId: prepSandboxId,
            repoId: appRepoId,
            branch,
            buildCommands: config.buildCommands ?? [],
            seedCommands: config.seedCommands ?? [],
          },
          { retry: { maxAttempts: 3, initialBackoffMs: 10000, base: 2 } },
        );

        let seedState = "running";
        let lastStage: string | null = null;
        for (
          let pollAttempt = 1;
          pollAttempt <= MAX_SEED_RUN_POLLS && seedState === "running";
          pollAttempt++
        ) {
          const poll = await step.runAction(
            internal.snapshotActions.pollSeedRun,
            { sandboxId: prepSandboxId, repoId: appRepoId },
            { runAfter: SEED_RUN_POLL_DELAY_MS },
          );
          seedState = poll.state;
          if (poll.stage !== null && poll.stage !== lastStage) {
            lastStage = poll.stage;
            await step.runMutation(internal.repoSnapshots.appendLogs, {
              buildId: args.buildId,
              chunk: `[base image] stage: ${poll.stage} (~${formatPollElapsed(pollAttempt)} in)\n`,
            });
          }
        }
        if (seedState !== "done") {
          const diagnostics = await step.runAction(
            internal.snapshotActions.fetchSeedDiagnostics,
            { sandboxId: prepSandboxId, repoId: appRepoId },
          );
          await step.runMutation(internal.repoSnapshots.appendLogs, {
            buildId: args.buildId,
            chunk: `[Vercel base image] prep FAILED (${seedState}) — diagnostics:\n${diagnostics}\n`,
          });
          await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
            sandboxId: prepSandboxId,
            repoId: appRepoId,
          });
          prepSandboxId = null;
          await step.runMutation(internal.repoSnapshots.completeBuild, {
            buildId: args.buildId,
            status: "error",
            logs: "",
            error: `Vercel base Image prep did not complete (state: ${seedState}) — see logs for diagnostics`,
          });
          return;
        }

        await step.runMutation(internal.repoSnapshots.appendLogs, {
          buildId: args.buildId,
          chunk:
            "[base image] prep complete; capturing the sandbox filesystem into a snapshot (usually ~6m)...\n",
        });
        const { snapshotId: effectiveBaseId } = await step.runAction(
          internal.snapshotActions.triggerSeededSnapshot,
          {
            repoId: appRepoId,
            sandboxId: prepSandboxId,
            seededName: baseSnapshotLabel,
          },
        );

        let snapState: SnapshotState = "pending";
        for (
          let pollAttempt = 1;
          pollAttempt <= MAX_SEED_SNAPSHOT_POLLS &&
          !isTerminalSnapshotState(snapState);
          pollAttempt++
        ) {
          snapState = await step.runAction(
            internal.snapshotActions.pollSeededSnapshotState,
            { repoId: appRepoId, seededName: effectiveBaseId },
            {
              runAfter:
                pollAttempt === 1 ? 10_000 : SEED_SNAPSHOT_POLL_DELAY_MS,
            },
          );
        }
        if (snapState !== "ready") {
          await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
            sandboxId: prepSandboxId,
            repoId: appRepoId,
          });
          prepSandboxId = null;
          await step.runAction(internal.snapshotActions.deleteSeededSnapshot, {
            snapshotName: effectiveBaseId,
            repoId: appRepoId,
          });
          await step.runMutation(internal.repoSnapshots.completeBuild, {
            buildId: args.buildId,
            status: "error",
            logs: "",
            error: `Vercel base Image did not reach active (last state: ${snapState})`,
          });
          return;
        }

        await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
          sandboxId: prepSandboxId,
          repoId: appRepoId,
          preserveSnapshotId: effectiveBaseId,
        });
        prepSandboxId = null;

        await step.runMutation(internal.repoSnapshots.setBaseSnapshotId, {
          repoSnapshotId: args.repoSnapshotId,
          baseSnapshotId: effectiveBaseId,
        });
        rebuiltBaseSnapshotId = effectiveBaseId;

        if (
          previousBaseSnapshotId &&
          previousBaseSnapshotId !== effectiveBaseId
        ) {
          try {
            await step.runAction(
              internal.snapshotActions.deleteSeededSnapshot,
              {
                snapshotName: previousBaseSnapshotId,
                repoId: appRepoId,
              },
            );
          } catch (e) {
            console.error(
              `[snapshot] failed to delete previous Vercel base snapshot ${previousBaseSnapshotId}: ${errorMessage(
                e,
              )}`,
            );
          }
        }

        if (hasStopCommands) {
          await step.runMutation(internal.repoSnapshots.appendLogs, {
            buildId: args.buildId,
            chunk: `Vercel base Image ${effectiveBaseId} built successfully; seeding next.\n`,
          });
        } else {
          await step.runMutation(internal.repoSnapshots.completeBuild, {
            buildId: args.buildId,
            status: "success",
            logs: `Vercel base Image ${effectiveBaseId} built successfully.\n`,
          });
        }
      } catch (e) {
        if (prepSandboxId) {
          await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
            sandboxId: prepSandboxId,
            repoId: appRepoId,
          });
        }
        await step.runMutation(internal.repoSnapshots.completeBuild, {
          buildId: args.buildId,
          status: "error",
          logs: "",
          error:
            e instanceof Error
              ? e.message
              : "Vercel base Image build failed unexpectedly",
        });
        return;
      }
    } else {
      await step.runMutation(internal.repoSnapshots.appendLogs, {
        buildId: args.buildId,
        chunk: `Seeding snapshot: building fresh sandbox with toolchain + deps + seed commands (branch: ${branch}).\n`,
      });
    }

    if (!hasStopCommands) return;

    const seededName = `seeded-${appRepoId}`;
    let prepSandboxId: string | null = null;

    const failBuild = async (error: string): Promise<void> => {
      await step.runMutation(internal.repoSnapshots.recordSeededApp, {
        buildId: args.buildId,
        repoId: appRepoId,
        status: "fallback",
        seededSnapshotName: null,
      });
      await step.runMutation(internal.repoSnapshots.completeBuild, {
        buildId: args.buildId,
        status: "error",
        logs: "",
        error,
      });
    };

    try {
      await step.runMutation(internal.repoSnapshots.recordSeededApp, {
        buildId: args.buildId,
        repoId: appRepoId,
        status: "running",
        seededSnapshotName: null,
      });

      const seedImageSnapshot = rebuiltBaseSnapshotId ?? config.baseSnapshotId;
      const created = await step.runAction(
        internal.snapshotActions.createSeedPrepSandbox,
        { repoId: appRepoId, imageSnapshot: seedImageSnapshot },
        { retry: { maxAttempts: 4, initialBackoffMs: 15000, base: 2 } },
      );
      if (!created.ok) {
        await failBuild(created.error);
        return;
      }
      prepSandboxId = created.sandboxId;

      await step.runAction(
        internal.sandbox.fetchBaseBranch,
        {
          sandboxId: prepSandboxId,
          installationId: repo.installationId,
          repoOwner: repo.owner,
          repoName: repo.name,
          baseBranch: branch,
          repoId: appRepoId,
        },
        { retry: { maxAttempts: 3, initialBackoffMs: 10000, base: 2 } },
      );

      const seededFingerprint = await step.runQuery(
        internal.repoSnapshots.getCurrentSeedFingerprint,
        { repoId: appRepoId },
      );

      await step.runAction(
        internal.snapshotActions.launchSeedRun,
        {
          sandboxId: prepSandboxId,
          repoId: appRepoId,
          branch,
          buildCommands: config.buildCommands ?? [],
          seedCommands: config.seedCommands ?? [],
        },
        { retry: { maxAttempts: 3, initialBackoffMs: 10000, base: 2 } },
      );

      let seedState = "running";
      let lastStage: string | null = null;
      for (
        let pollAttempt = 1;
        pollAttempt <= MAX_SEED_RUN_POLLS && seedState === "running";
        pollAttempt++
      ) {
        const poll = await step.runAction(
          internal.snapshotActions.pollSeedRun,
          { sandboxId: prepSandboxId, repoId: appRepoId },
          { runAfter: SEED_RUN_POLL_DELAY_MS },
        );
        seedState = poll.state;
        if (poll.stage !== null && poll.stage !== lastStage) {
          lastStage = poll.stage;
          await step.runMutation(internal.repoSnapshots.appendLogs, {
            buildId: args.buildId,
            chunk: `[seed] stage: ${poll.stage} (~${formatPollElapsed(pollAttempt)} in)\n`,
          });
        }
      }
      if (seedState !== "done") {
        const diagnostics = await step.runAction(
          internal.snapshotActions.fetchSeedDiagnostics,
          { sandboxId: prepSandboxId, repoId: appRepoId },
        );
        await step.runMutation(internal.repoSnapshots.appendLogs, {
          buildId: args.buildId,
          chunk: `[seed ${appRepoId}] FAILED (${seedState}) — diagnostics:\n${diagnostics}\n`,
        });
        await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
          sandboxId: prepSandboxId,
          repoId: appRepoId,
        });
        prepSandboxId = null;
        await failBuild(
          `Seed run did not complete (state: ${seedState}) — see logs for diagnostics`,
        );
        return;
      }

      const previousSeededSnapshotName = repo.seededSnapshotName ?? null;

      await step.runMutation(internal.repoSnapshots.appendLogs, {
        buildId: args.buildId,
        chunk:
          "[seed] seed run complete; capturing the sandbox filesystem into a snapshot (usually ~6m)...\n",
      });
      const { snapshotId: effectiveSeededName } = await step.runAction(
        internal.snapshotActions.triggerSeededSnapshot,
        { repoId: appRepoId, sandboxId: prepSandboxId, seededName },
      );

      let snapState: SnapshotState = "pending";
      for (
        let pollAttempt = 1;
        pollAttempt <= MAX_SEED_SNAPSHOT_POLLS &&
        !isTerminalSnapshotState(snapState);
        pollAttempt++
      ) {
        snapState = await step.runAction(
          internal.snapshotActions.pollSeededSnapshotState,
          { repoId: appRepoId, seededName: effectiveSeededName },
          {
            runAfter: pollAttempt === 1 ? 10_000 : SEED_SNAPSHOT_POLL_DELAY_MS,
          },
        );
      }
      if (snapState !== "ready") {
        await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
          sandboxId: prepSandboxId,
          repoId: appRepoId,
        });
        prepSandboxId = null;
        await step.runAction(internal.snapshotActions.deleteSeededSnapshot, {
          snapshotName: effectiveSeededName,
          repoId: appRepoId,
        });
        await failBuild(
          `Seeded snapshot did not reach active (last state: ${snapState})`,
        );
        return;
      }

      await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
        sandboxId: prepSandboxId,
        repoId: appRepoId,
        preserveSnapshotId: effectiveSeededName,
      });
      prepSandboxId = null;

      await step.runMutation(internal.repoSnapshots.setSeededSnapshotName, {
        repoId: appRepoId,
        seededSnapshotName: effectiveSeededName,
        ...(seededFingerprint !== null ? { seededFingerprint } : {}),
      });
      await step.runMutation(internal.repoSnapshots.recordSeededApp, {
        buildId: args.buildId,
        repoId: appRepoId,
        status: "seeded",
        seededSnapshotName: effectiveSeededName,
      });

      await step.runMutation(internal.repoSnapshots.completeBuild, {
        buildId: args.buildId,
        status: "success",
        logs: `Seeded snapshot ${effectiveSeededName} built for this app.\n`,
      });

      try {
        const groupIdsToRebuild = await step.runQuery(
          internal.repoGroups.listGroupsByPrimaryRepo,
          { primaryRepoId: appRepoId },
        );
        for (const groupId of groupIdsToRebuild) {
          await step.runMutation(internal.repoGroups.scheduleGroupRebuild, {
            groupId,
          });
        }
      } catch (e) {
        console.error(
          `[snapshot] failed to schedule repo group rebuilds for repo ${appRepoId}: ${errorMessage(
            e,
          )}`,
        );
      }

      if (
        previousSeededSnapshotName &&
        previousSeededSnapshotName !== effectiveSeededName
      ) {
        try {
          await step.runAction(internal.snapshotActions.deleteSeededSnapshot, {
            snapshotName: previousSeededSnapshotName,
            repoId: appRepoId,
          });
        } catch (e) {
          console.error(
            `[snapshot] failed to delete previous seeded snapshot ${previousSeededSnapshotName}: ${errorMessage(
              e,
            )}`,
          );
        }
      }
    } catch (e) {
      console.error(
        `[snapshot] single seeded build failed: ${errorMessage(e)}`,
      );
      if (prepSandboxId) {
        await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
          sandboxId: prepSandboxId,
          repoId: appRepoId,
        });
      }
      await failBuild(errorMessage(e));
    }
  },
});
