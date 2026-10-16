import type { WorkflowCtx } from "@convex-dev/workflow";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { ensureSandboxStartedSteps } from "./resumeSandboxSteps";

type ProgressStep = {
  type: "tool";
  label: string;
  status: "active" | "complete" | "pending";
};

type PrepareSandboxArgs = {
  installationId: number;
  repoOwner: string;
  repoName: string;
  repoId: Id<"githubRepos">;
  streamingEntityId: string;
  ephemeral: boolean;
  existingSandboxId?: string;
  attachRunId?: Id<"agentRuns">;
  baseBranch?: string;
  branchName?: string;
  sessionPersistenceId?: Id<"sessions"> | Id<"projects">;
  sessionPersistenceKind?: "sessions" | "projects";
  createRetry?: { maxAttempts: number; initialBackoffMs: number; base: number };
  /** Skip repo startup + background commands (read-only ephemeral agent runs). */
  skipStartupCommands?: boolean;
};

const FETCH_STEP_RETRY = {
  retry: { maxAttempts: 1, initialBackoffMs: 1000, base: 2 },
};

const BRANCH_STEP_RETRY = {
  retry: { maxAttempts: 3, initialBackoffMs: 2500, base: 2 },
};

/**
 * Stages this run walks through after the sandbox exists, in order. The UI
 * shows the ones not reached yet as pending. A stage can still drop out (a
 * failed task-branch fetch, a startup-commands marker that already exists).
 */
export function plannedStartupStages(
  args: Pick<PrepareSandboxArgs, "branchName" | "baseBranch" | "skipStartupCommands">,
): string[] {
  const branchStages = args.branchName
    ? ["Fetching task branch...", "Setting up branch..."]
    : args.baseBranch
      ? ["Checking out base branch..."]
      : [];
  const commandStages = args.skipStartupCommands
    ? []
    : [
        "Restoring seeded runtime...",
        "Launching background commands...",
        "Running startup commands...",
      ];
  return ["Fetching base branch...", ...branchStages, ...commandStages];
}

/** Finished stages, then the running one, then every planned stage after it as pending. */
export function startupProgress(
  completed: ReadonlyArray<ProgressStep>,
  activeLabel: string,
  plan: ReadonlyArray<string>,
): Array<ProgressStep> {
  const remaining = plan.slice(plan.indexOf(activeLabel) + 1);
  return [
    ...completed,
    { type: "tool", label: activeLabel, status: "active" },
    ...remaining.map(
      (label): ProgressStep => ({ type: "tool", label, status: "pending" }),
    ),
  ];
}

/** Emits progress steps to the streaming entity for real-time UI updates. */
async function emitSteps(
  step: WorkflowCtx,
  streamingEntityId: string,
  steps: Array<ProgressStep>,
): Promise<void> {
  await step.runMutation(internal.streaming.internalSet, {
    entityId: streamingEntityId,
    currentActivity: JSON.stringify(steps),
  });
}

type PrepareSandboxResult = {
  sandboxId: string;
  resumeFellBack: boolean;
};

/** Orchestrates sandbox creation and local branch setup as a multi-step workflow. */
export async function prepareSandboxSteps(
  step: WorkflowCtx,
  args: PrepareSandboxArgs,
): Promise<PrepareSandboxResult> {
  const completedSteps: Array<ProgressStep> = [];
  const baseBranch = args.baseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const plan = plannedStartupStages(args);
  const emitActive = (label: string) =>
    emitSteps(
      step,
      args.streamingEntityId,
      startupProgress(completedSteps, label, plan),
    );

  // Resolve which existing sandbox (if any) to reuse before the create/resume
  // action inside createOrResumeSandbox → ensureSandboxRunning.
  if (args.existingSandboxId) {
    await ensureSandboxStartedSteps(step, {
      sandboxId: args.existingSandboxId,
      repoId: args.repoId,
      streamingEntityId: args.streamingEntityId,
    });
  }

  // Step 1: Create/resume the sandbox only.
  // Snapshot-backed quick tasks should start from local refs instead of
  // blocking sandbox acquisition on a network fetch.
  const setupResult = await step.runAction(
    internal.sandbox.createOrResumeSandbox,
    {
      existingSandboxId: args.existingSandboxId,
      installationId: args.installationId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      ephemeral: args.ephemeral,
      repoId: args.repoId,
      attachRunId: args.attachRunId,
      sessionPersistenceId: args.sessionPersistenceId,
      sessionPersistenceKind: args.sessionPersistenceKind,
      streamingEntityId: args.streamingEntityId,
    },
    args.createRetry ? { retry: args.createRetry } : undefined,
  );
  const { sandboxId, resumeFellBack } = setupResult;

  completedSteps.push({
    type: "tool",
    label: "Creating sandbox...",
    status: "complete",
  });

  // Step 2: Fetch latest refs needed for checkout/setup.
  await emitActive("Fetching base branch...");
  try {
    await step.runAction(
      internal.sandbox.fetchBaseBranch,
      {
        sandboxId,
        installationId: args.installationId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        baseBranch,
        repoId: args.repoId,
      },
      FETCH_STEP_RETRY,
    );
  } catch {
    // Non-fatal: snapshot already has the codebase.
    // resolveBaseTarget falls back to local refs when remote isn't fetched.
    console.warn(
      `[prepareSandbox] fetch base branch (${baseBranch}) failed — continuing with local snapshot refs`,
    );
  }
  completedSteps.push({
    type: "tool",
    label: "Fetching base branch...",
    status: "complete",
  });

  if (args.branchName) {
    await emitActive("Fetching task branch...");
    try {
      await step.runAction(
        internal.sandbox.fetchBaseBranch,
        {
          sandboxId,
          installationId: args.installationId,
          repoOwner: args.repoOwner,
          repoName: args.repoName,
          baseBranch: args.branchName,
          repoId: args.repoId,
        },
        FETCH_STEP_RETRY,
      );
      completedSteps.push({
        type: "tool",
        label: "Fetching task branch...",
        status: "complete",
      });
    } catch {
      // Non-fatal: branch may not exist yet (new task) or network unreachable.
      // setupBranch falls back to local refs via resolveBranchStartTarget.
      console.warn(
        `[prepareSandbox] fetch task branch (${args.branchName}) failed — continuing with local refs`,
      );
    }
  }

  // Step 3: Checkout or create the working branch from latest fetched refs.
  if (args.branchName) {
    await emitActive("Setting up branch...");

    await step.runAction(
      internal.sandbox.setupSandboxBranch,
      {
        sandboxId,
        branchName: args.branchName,
        baseBranch,
        repoId: args.repoId,
      },
      BRANCH_STEP_RETRY,
    );
  } else if (args.baseBranch) {
    await emitActive("Checking out base branch...");

    await step.runAction(
      internal.sandbox.checkoutBaseBranch,
      {
        sandboxId,
        baseBranch: args.baseBranch,
        repoId: args.repoId,
      },
      BRANCH_STEP_RETRY,
    );
  }

  // Step 4: Restore service state baked into seeded snapshots before daemons
  // or startup commands touch local dependencies. No-ops for ordinary snapshots.
  if (!args.skipStartupCommands) {
    await emitActive("Restoring seeded runtime...");
    await step.runAction(
      internal.sandbox.restoreSeededRuntimeState,
      { sandboxId, repoId: args.repoId },
      { retry: { maxAttempts: 1, initialBackoffMs: 1000, base: 2 } },
    );
    completedSteps.push({
      type: "tool",
      label: "Restoring seeded runtime...",
      status: "complete",
    });
  }

  // Step 5: Launch background commands (long-running daemons / services) FIRST,
  // before startup commands, so one-time startup/seed work can depend on services
  // being up (e.g. `supabase start`, `npx convex dev`). Skipped together with
  // startup for read-only ephemeral flows (PR recap, interview). Non-fatal.
  if (!args.skipStartupCommands) {
    await emitActive("Launching background commands...");
    try {
      const result = await step.runAction(
        internal.sandbox.runBackgroundCommands,
        { sandboxId, repoId: args.repoId },
        { retry: { maxAttempts: 1, initialBackoffMs: 1000, base: 2 } },
      );
      if (result.ran) {
        completedSteps.push({
          type: "tool",
          label: "Launching background commands...",
          status: "complete",
        });
        if (result.commandCount > 0) {
          console.log(
            `[prepareSandbox] Launched ${result.commandCount} background command(s)`,
          );
          if (result.errors.length > 0) {
            console.warn(
              `[prepareSandbox] Background command errors: ${result.errors.join("; ")}`,
            );
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[prepareSandbox] Background commands failed — continuing: ${msg}`,
      );
    }
  }

  // Step 6: Run startup commands once per sandbox (marker file). Skipped for
  // read-only ephemeral flows (PR recap) and when a reused project sandbox
  // already paid this cost on the first task. Startup commands that depend on
  // services should wait for readiness themselves, since background daemons
  // above are launched detached.
  let shouldRunStartupCommands = !args.skipStartupCommands;
  if (shouldRunStartupCommands) {
    const markerExists = await step.runAction(
      internal.sandbox.startupCommandsMarkerExists,
      { sandboxId, repoId: args.repoId },
    );
    if (markerExists) {
      shouldRunStartupCommands = false;
    }
  }

  if (shouldRunStartupCommands) {
    await emitActive("Running startup commands...");
    try {
      const result = await step.runAction(
        internal.sandbox.runStartupCommands,
        { sandboxId, repoId: args.repoId },
        { retry: { maxAttempts: 1, initialBackoffMs: 1000, base: 2 } },
      );
      if (result.ran) {
        completedSteps.push({
          type: "tool",
          label: "Running startup commands...",
          status: "complete",
        });
        if (result.commandCount > 0) {
          console.log(
            `[prepareSandbox] Ran ${result.commandCount} startup command(s)`,
          );
          if (result.errors.length > 0) {
            console.warn(
              `[prepareSandbox] Startup command errors: ${result.errors.join("; ")}`,
            );
          }
        }
      }
    } catch (e) {
      // Non-fatal: log warning and continue
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[prepareSandbox] Startup commands failed — continuing: ${msg}`,
      );
    }
  }

  return { sandboxId, resumeFellBack };
}
