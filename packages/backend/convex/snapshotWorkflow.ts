import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import type { WorkflowCtx } from "@convex-dev/workflow";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { workflow } from "./workflowManager";
import { isTerminalSnapshotState } from "./_sandbox_runtime/snapshotStates";

// Detached seed-run poll loop (per app). The whole per-app pipeline (git
// update, deps/build, daemons, seed, clean stop) runs as ONE detached script on
// the sandbox (launchSeedRun) so no Convex action ever waits on a slow command
// — cold docker pulls or readiness waits can take as long as they need. The
// workflow just polls the script's outcome markers.
const SEED_RUN_POLL_DELAY_MS = 20_000;
const MAX_SEED_RUN_POLLS = 150; // ~50 minutes at 20s intervals

// Seeded-snapshot capture poll loop (per app). The capture is triggered
// without blocking (triggerSeededSnapshot) then polled here across separate
// steps, so a long DB-volume capture never exceeds Convex's 600s per-action
// ceiling. We poll the snapshot entity until it reaches "active" (success) or a
// failure state — see pollSeededSnapshotState for why the sandbox state is not
// a reliable completion signal.
const SEED_SNAPSHOT_POLL_DELAY_MS = 15_000;
const MAX_SEED_SNAPSHOT_POLLS = 240; // ~60 minutes at 15s intervals — captures
// normally finish in ~6m but have been observed taking 40m+ when the sandbox
// provider's builder/runner infrastructure is degraded; the window must outlast
// a bad day because exhausting it costs the app its seeded refresh for this
// build.

// Approximate wall-clock into the seed run at poll N. Each iteration is the
// runAfter delay plus the poll exec itself (~1s), so the delay dominates;
// Date.now() is unavailable in a deterministic workflow body.
function formatPollElapsed(pollAttempt: number): string {
  const totalSeconds = Math.round(
    (pollAttempt * SEED_RUN_POLL_DELAY_MS) / 1000,
  );
  if (totalSeconds < 90) return `${totalSeconds}s`;
  return `${Math.round(totalSeconds / 60)}m`;
}

type SnapshotConfig = NonNullable<
  FunctionReturnType<typeof internal.repoSnapshots.getRepoSnapshotInternal>
>;
type SnapshotRepo = NonNullable<
  FunctionReturnType<typeof internal.repoSnapshots.getRepo>
>;

/** Resolved inputs shared by the base Image and seeded snapshot phases. */
type SnapshotBuildInput = {
  buildId: Id<"snapshotBuilds">;
  repoSnapshotId: Id<"repoSnapshots">;
  appRepoId: Id<"githubRepos">;
  config: SnapshotConfig;
  repo: SnapshotRepo;
  branch: string;
};

/**
 * The live seed-prep sandbox, if any. Holder object so the catch branch sees
 * the id at the exact point the happy path threw.
 */
type PrepSandbox = { id: string | null };

const PREP_SANDBOX_CREATE_RETRY = {
  retry: { maxAttempts: 4, initialBackoffMs: 15000, base: 2 },
};
const SEED_STEP_RETRY = {
  retry: { maxAttempts: 3, initialBackoffMs: 10000, base: 2 },
};

/** Resolves config + repo (owner/name/installation drive git fetch auth). Null = build already failed. */
async function resolveSnapshotBuildInput(
  step: WorkflowCtx,
  args: {
    buildId: Id<"snapshotBuilds">;
    repoSnapshotId: Id<"repoSnapshots">;
    appRepoId?: Id<"githubRepos">;
  },
): Promise<SnapshotBuildInput | null> {
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
    return null;
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
    return null;
  }
  return {
    buildId: args.buildId,
    repoSnapshotId: args.repoSnapshotId,
    appRepoId,
    config,
    repo,
    branch: config.workflowRef ?? "main",
  };
}

/**
 * Vercel base Image build. Returns the new base snapshot id, or null when the
 * build was already completed with an error.
 */
async function rebuildVercelBaseImage(
  step: WorkflowCtx,
  input: SnapshotBuildInput,
  hasStopCommands: boolean,
): Promise<string | null> {
  const prep: PrepSandbox = { id: null };
  // Keep-last-good: hold the previous base id and delete it only AFTER
  // the new one is captured and stored. Deleting up front would leave
  // repoSnapshots.baseSnapshotId pointing at a deleted snapshot on any
  // failure, breaking every sandbox boot until the next success.
  const previousBaseSnapshotId = input.config.baseSnapshotId ?? null;

  await step.runMutation(internal.repoSnapshots.appendLogs, {
    buildId: input.buildId,
    chunk:
      "Vercel base Image build: fresh sandbox → toolchain + pnpm install + build commands → snap_* capture...\n",
  });

  try {
    return await runVercelBaseImageBuild(
      step,
      input,
      previousBaseSnapshotId,
      hasStopCommands,
      prep,
    );
  } catch (e) {
    if (prep.id) {
      await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
        sandboxId: prep.id,
        repoId: input.appRepoId,
      });
    }
    await step.runMutation(internal.repoSnapshots.completeBuild, {
      buildId: input.buildId,
      status: "error",
      logs: "",
      error:
        e instanceof Error
          ? e.message
          : "Vercel base Image build failed unexpectedly",
    });
    return null;
  }
}

async function runVercelBaseImageBuild(
  step: WorkflowCtx,
  input: SnapshotBuildInput,
  previousBaseSnapshotId: string | null,
  hasStopCommands: boolean,
  prep: PrepSandbox,
): Promise<string | null> {
  const { buildId, appRepoId } = input;
  const baseSnapshotLabel = `base-${input.config.repoId}`;
  const created = await step.runAction(
    internal.snapshotActions.createSeedPrepSandbox,
    { repoId: appRepoId, imageSnapshot: input.config.snapshotName },
    PREP_SANDBOX_CREATE_RETRY,
  );
  if (!created.ok) {
    await step.runMutation(internal.repoSnapshots.completeBuild, {
      buildId,
      status: "error",
      logs: "",
      error: created.error,
    });
    return null;
  }
  const prepSandboxId = created.sandboxId;
  prep.id = prepSandboxId;

  const seedState = await runDetachedSeed(
    step,
    input,
    prepSandboxId,
    "[base image]",
  );
  if (seedState !== "done") {
    await appendSeedDiagnostics(
      step,
      input,
      prepSandboxId,
      `[Vercel base image] prep FAILED (${seedState})`,
    );
    await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
      sandboxId: prepSandboxId,
      repoId: appRepoId,
    });
    prep.id = null;
    await step.runMutation(internal.repoSnapshots.completeBuild, {
      buildId,
      status: "error",
      logs: "",
      error: `Vercel base Image prep did not complete (state: ${seedState}) — see logs for diagnostics`,
    });
    return null;
  }

  await step.runMutation(internal.repoSnapshots.appendLogs, {
    buildId,
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

  let snapState = "pending";
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
        runAfter: pollAttempt === 1 ? 10_000 : SEED_SNAPSHOT_POLL_DELAY_MS,
      },
    );
  }
  if (snapState !== "active") {
    await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
      sandboxId: prepSandboxId,
      repoId: appRepoId,
    });
    prep.id = null;
    await step.runAction(internal.snapshotActions.deleteSeededSnapshot, {
      snapshotName: effectiveBaseId,
      repoId: appRepoId,
    });
    await step.runMutation(internal.repoSnapshots.completeBuild, {
      buildId,
      status: "error",
      logs: "",
      error: `Vercel base Image did not reach active (last state: ${snapState})`,
    });
    return null;
  }

  await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
    sandboxId: prepSandboxId,
    repoId: appRepoId,
    // Keep the new base snap_* — Vercel delete does not cascade reliably.
    preserveSnapshotId: effectiveBaseId,
  });
  prep.id = null;

  await step.runMutation(internal.repoSnapshots.setBaseSnapshotId, {
    repoSnapshotId: input.repoSnapshotId,
    baseSnapshotId: effectiveBaseId,
  });

  // New base is stored and bootable — now retire the previous one.
  // Best-effort: a leaked old snapshot is harmless; failing the build
  // here would be worse than leaving it for the next rebuild to clear.
  if (previousBaseSnapshotId && previousBaseSnapshotId !== effectiveBaseId) {
    try {
      await step.runAction(internal.snapshotActions.deleteSeededSnapshot, {
        snapshotName: previousBaseSnapshotId,
        repoId: appRepoId,
      });
    } catch (e) {
      console.error(
        `[snapshot] failed to delete previous Vercel base snapshot ${previousBaseSnapshotId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  // Only finish here when nothing follows. completeBuild ignores any
  // build that is no longer "running", so marking success before the
  // seed step would hide the seed's own result — and drop the build out
  // of "running", letting a second Rebuild Now start alongside it.
  if (hasStopCommands) {
    await step.runMutation(internal.repoSnapshots.appendLogs, {
      buildId,
      chunk: `Vercel base Image ${effectiveBaseId} built successfully; seeding next.\n`,
    });
  } else {
    await step.runMutation(internal.repoSnapshots.completeBuild, {
      buildId,
      status: "success",
      logs: `Vercel base Image ${effectiveBaseId} built successfully.\n`,
    });
  }
  return effectiveBaseId;
}

/**
 * Fetches fresh refs, launches the detached seed script and polls its markers.
 * Returns the final seed state ("done" on success).
 */
async function runDetachedSeed(
  step: WorkflowCtx,
  input: SnapshotBuildInput,
  prepSandboxId: string,
  stageLabel: string,
): Promise<string> {
  const { appRepoId, repo, config, branch } = input;
  // Fresh refs for the detached script's hard reset (owns git auth).
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
    SEED_STEP_RETRY,
  );

  // Launch the whole pipeline detached; poll its outcome markers. The
  // launch is idempotent (live-process guard), so retries can't race a
  // second copy of the script.
  await step.runAction(
    internal.snapshotActions.launchSeedRun,
    {
      sandboxId: prepSandboxId,
      repoId: appRepoId,
      branch,
      buildCommands: config.buildCommands ?? [],
      seedCommands: config.seedCommands ?? [],
    },
    SEED_STEP_RETRY,
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
    // Stream stage transitions so the build page shows live progress
    // instead of staying silent until the terminal status.
    if (poll.stage !== null && poll.stage !== lastStage) {
      lastStage = poll.stage;
      await step.runMutation(internal.repoSnapshots.appendLogs, {
        buildId: input.buildId,
        chunk: `${stageLabel} stage: ${poll.stage} (~${formatPollElapsed(pollAttempt)} in)\n`,
      });
    }
  }
  return seedState;
}

/** Copies seed-run diagnostics into the build logs before teardown. */
async function appendSeedDiagnostics(
  step: WorkflowCtx,
  input: SnapshotBuildInput,
  prepSandboxId: string,
  heading: string,
): Promise<void> {
  const diagnostics = await step.runAction(
    internal.snapshotActions.fetchSeedDiagnostics,
    { sandboxId: prepSandboxId, repoId: input.appRepoId },
  );
  await step.runMutation(internal.repoSnapshots.appendLogs, {
    buildId: input.buildId,
    chunk: `${heading} — diagnostics:\n${diagnostics}\n`,
  });
}

/**
 * This app's own seeded snapshot just moved — any codebase group that uses it
 * as its primary has a stale fingerprint now, so schedule each one to rebuild.
 * Best-effort: buildGroupSnapshot logs and no-ops on its own failures, so a
 * lookup/schedule failure here must not fail the build.
 */
async function scheduleRepoGroupRebuilds(
  step: WorkflowCtx,
  appRepoId: Id<"githubRepos">,
): Promise<void> {
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
      `[snapshot] failed to schedule repo group rebuilds for repo ${appRepoId}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
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
    // App that triggered the build (when using a shared monorepo snapshot config).
    appRepoId: v.optional(v.id("githubRepos")),
    // Rebuild the declarative base Image first (bootstrap / toolchain
    // changes). The nightly cron and Rebuild Now leave this unset.
    forceImageRebuild: v.optional(v.boolean()),
    // Operational bootstrap path: seed app snapshots from the base Image
    // instead of their previous seeded snapshots. Use once when a seeded app
    // snapshot is too stale to boot its local services cleanly.
    forceBaseSeed: v.optional(v.boolean()),
  },
  handler: async (step, args) => {
    const input = await resolveSnapshotBuildInput(step, args);
    if (!input) return;
    const { appRepoId, branch } = input;

    const providerKind = await step.runAction(
      internal.sandbox.getSandboxProviderKind,
      { repoId: appRepoId },
    );
    await step.runMutation(internal.repoSnapshots.setBuildProvider, {
      buildId: args.buildId,
      provider: providerKind,
    });

    // Stop Commands live on the app repo; shared monorepo configs may point at
    // the parent while the build is triggered from apps/web or eprocurement.
    const hasStopCommands = (input.repo.stopCommands?.length ?? 0) > 0;
    const imageOnlyBuild = !hasStopCommands && args.forceImageRebuild !== true;
    const rebuildBaseImage = args.forceImageRebuild === true || imageOnlyBuild;
    if (imageOnlyBuild) {
      await step.runMutation(internal.repoSnapshots.appendLogs, {
        buildId: args.buildId,
        chunk:
          "No Stop Commands configured on this app (add them to enable seeded snapshots). Rebuilding base Image snapshot only.\n",
      });
    }

    // Bootstrap / toolchain path: rebuild the base Image first
    // (serial — captures contending with the Image builder slow both down).
    // `config` was read before the base rebuild, so its baseSnapshotId is the
    // PREVIOUS base — which the rebuild below deletes once the new one is stored.
    // Seeding after a rebuild must boot from the new id, not that stale one.
    let rebuiltBaseSnapshotId: string | undefined;
    if (rebuildBaseImage) {
      if (providerKind === "vercel") {
        const baseSnapshotId = await rebuildVercelBaseImage(
          step,
          input,
          hasStopCommands,
        );
        if (baseSnapshotId === null) return;
        rebuiltBaseSnapshotId = baseSnapshotId;
      }
      // Vercel is the only sandbox provider; the historical Daytona path
      // (declarative Image build via kickOffSnapshotBuild/pollSnapshotProgress)
      // has been removed. providerKind is still recorded above (setBuildProvider)
      // for historical build labeling.
    } else {
      await step.runMutation(internal.repoSnapshots.appendLogs, {
        buildId: args.buildId,
        chunk: `Seeding snapshot: building fresh sandbox with toolchain + deps + seed commands (branch: ${branch}).\n`,
      });
    }

    // No seeding without Stop Commands. This also covers forceImageRebuild on an
    // app with no Stop Commands: rebuild the base Image above, then stop here
    // (there is nothing to seed).
    if (!hasStopCommands) return;

    // Per-app seeding: this app's snapshot is built and captured independently.
    const seededName = `seeded-${appRepoId}`;
    const prep: PrepSandbox = { id: null };

    // Error handler: mark this app as fallback and complete the build with an error.
    // On failure, clear the seeded snapshot name (conservative keep-last-good: the old one
    // stays live until a successful build replaces it).
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
      await runSeededBuild(step, input, {
        seededName,
        rebuiltBaseSnapshotId,
        prep,
        failBuild,
      });
    } catch (e) {
      console.error(
        `[snapshot] single seeded build failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      if (prep.id) {
        await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
          sandboxId: prep.id,
          repoId: appRepoId,
        });
      }
      await failBuild(e instanceof Error ? e.message : String(e));
    }
  },
});

/** Seeded phase body. Throws to the handler's catch, which tears down `prep`. */
async function runSeededBuild(
  step: WorkflowCtx,
  input: SnapshotBuildInput,
  seeding: {
    seededName: string;
    rebuiltBaseSnapshotId: string | undefined;
    prep: PrepSandbox;
    failBuild: (error: string) => Promise<void>;
  },
): Promise<void> {
  const { buildId, appRepoId, config, repo } = input;
  const { seededName, rebuiltBaseSnapshotId, prep, failBuild } = seeding;

  // Mark this app as actively seeding so the UI shows progress.
  await step.runMutation(internal.repoSnapshots.recordSeededApp, {
    buildId,
    repoId: appRepoId,
    status: "running",
    seededSnapshotName: null,
  });

  // Prefer the Vercel base Image (`snap_*`) when present so seed-prep does
  // not create a blank sandbox. `snapshotName` is the legacy Daytona-style
  // label (`snapshot-<repoId>`) and is treated as "no source" on Vercel,
  // which races toolchain install from scratch and can 404 on flaky
  // project lookups. Daytona used to accept snapshotName directly as its
  // Image name.
  const seedImageSnapshot =
    rebuiltBaseSnapshotId ?? config.baseSnapshotId ?? config.snapshotName;
  const created = await step.runAction(
    internal.snapshotActions.createSeedPrepSandbox,
    { repoId: appRepoId, imageSnapshot: seedImageSnapshot },
    PREP_SANDBOX_CREATE_RETRY,
  );
  if (!created.ok) {
    await failBuild(created.error);
    return;
  }
  const prepSandboxId = created.sandboxId;
  prep.id = prepSandboxId;

  const seedState = await runDetachedSeed(step, input, prepSandboxId, "[seed]");
  if (seedState !== "done") {
    // Grab the seed-run + daemon logs into the build record BEFORE the
    // sandbox is torn down — teardown destroys the evidence.
    await appendSeedDiagnostics(
      step,
      input,
      prepSandboxId,
      `[seed ${appRepoId}] FAILED (${seedState})`,
    );
    await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
      sandboxId: prepSandboxId,
      repoId: appRepoId,
    });
    prep.id = null;
    await failBuild(
      `Seed run did not complete (state: ${seedState}) — see logs for diagnostics`,
    );
    return;
  }

  // Get this app's previous seeded snapshot (for keep-last-good fallback and
  // later cleanup). Stored on the githubRepos record, queried above as `repo`.
  const previousSeededSnapshotName = repo.seededSnapshotName ?? null;

  // Capture the refreshed filesystem into ONE snapshot. Trigger fires the
  // POST without blocking; poll across separate steps so a long DB
  // capture never exceeds Convex's 600s per-action ceiling.
  // triggerSeededSnapshot returns the provider's actual snapshot id:
  // - Daytona (removed): equaled seededName (the snapshot name WAS its id)
  // - Vercel: a generated `snap_*` id distinct from seededName
  // All subsequent steps must use effectiveSeededName so that the right
  // id is polled and written to seededSnapshotName on every app repo.
  await step.runMutation(internal.repoSnapshots.appendLogs, {
    buildId,
    chunk:
      "[seed] seed run complete; capturing the sandbox filesystem into a snapshot (usually ~6m)...\n",
  });
  const { snapshotId: effectiveSeededName } = await step.runAction(
    internal.snapshotActions.triggerSeededSnapshot,
    { repoId: appRepoId, sandboxId: prepSandboxId, seededName },
  );

  let snapState = "pending";
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
  if (snapState !== "active") {
    await step.runAction(internal.snapshotActions.deleteSeedPrepSandbox, {
      sandboxId: prepSandboxId,
      repoId: appRepoId,
    });
    prep.id = null;
    // Best-effort: remove the partial/failed capture so it doesn't linger.
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
    // Keep the new seeded snap_* — Vercel delete does not cascade reliably.
    preserveSnapshotId: effectiveSeededName,
  });
  prep.id = null;

  // Point this app at the new snapshot (per-app model).
  await step.runMutation(internal.repoSnapshots.setSeededSnapshotName, {
    repoId: appRepoId,
    seededSnapshotName: effectiveSeededName,
  });
  await step.runMutation(internal.repoSnapshots.recordSeededApp, {
    buildId,
    repoId: appRepoId,
    status: "seeded",
    seededSnapshotName: effectiveSeededName,
  });

  await step.runMutation(internal.repoSnapshots.completeBuild, {
    buildId,
    status: "success",
    logs: `Seeded snapshot ${effectiveSeededName} built for this app.\n`,
  });

  await scheduleRepoGroupRebuilds(step, appRepoId);

  // Best-effort: delete the previous snapshot if it differed from the new one
  // (keep-last-good already swapped above, so failures here just leave a stray
  // snapshot that the next successful build removes).
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
        `[snapshot] failed to delete previous seeded snapshot ${previousSeededSnapshotName}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}

