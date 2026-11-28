import type { WorkflowCtx } from "@convex-dev/workflow";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { ensureSandboxStartedSteps } from "./resumeSandboxSteps";
import { type ProgressStep, startupProgress } from "./startupProgress";
import { errorMessage } from "@vvedantb/server";

type PrepareSandboxArgs = {
  installationId: number;
  repoOwner: string;
  repoName: string;
  repoId: Id<"githubRepos">;
  streamingEntityId: string;
  ephemeral: boolean;
  existingSandboxId?: string;
  baseBranch?: string;
  branchName?: string;
  createRetry?: { maxAttempts: number; initialBackoffMs: number; base: number };
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

  if (args.existingSandboxId) {
    await ensureSandboxStartedSteps(step, {
      sandboxId: args.existingSandboxId,
      repoId: args.repoId,
      streamingEntityId: args.streamingEntityId,
    });
  }

  const setupResult = await step.runAction(
    internal.sandbox.createOrResumeSandbox,
    {
      existingSandboxId: args.existingSandboxId,
      installationId: args.installationId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      ephemeral: args.ephemeral,
      repoId: args.repoId,
      streamingEntityId: args.streamingEntityId,
    },
    args.createRetry ? { retry: args.createRetry } : undefined,
  );
  const { sandboxId, resumeFellBack } = setupResult;

  try {
    completedSteps.push({
      type: "tool",
      label: "Creating sandbox...",
      status: "complete",
    });

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
        console.warn(
          `[prepareSandbox] fetch task branch (${args.branchName}) failed — continuing with local refs`,
        );
      }
    }

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
        const msg = errorMessage(e);
        console.warn(
          `[prepareSandbox] Background commands failed — continuing: ${msg}`,
        );
      }
    }

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
        const msg = errorMessage(e);
        console.warn(
          `[prepareSandbox] Startup commands failed — continuing: ${msg}`,
        );
      }
    }

    return { sandboxId, resumeFellBack };
  } catch (error) {
    if (args.ephemeral && args.existingSandboxId === undefined) {
      try {
        await step.runAction(internal.sandbox.deleteSandbox, {
          sandboxId,
          repoId: args.repoId,
        });
      } catch (cleanupError) {
        console.error(
          `[prepareSandbox] failed to delete half-prepared sandbox ${sandboxId}:`,
          cleanupError,
        );
      }
    }
    throw error;
  }
}
