import type { WorkflowCtx } from "@convex-dev/workflow";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

type EnsureSandboxStartedArgs = {
  sandboxId?: string;
  repoId: Id<"githubRepos">;
  /** When set, a "restoring…" activity is surfaced to this streaming entity. */
  streamingEntityId?: string;
  /**
   * True when the caller already knows the sandbox is running (e.g. the
   * session/project/task status is "active"). Suppresses the cosmetic
   * "Resuming sandbox…" activity so it does not flash on every message for an
   * already-running sandbox.
   */
  sandboxRunning?: boolean;
};

/** Surfaces a single-tool "active" activity to a streaming entity. */
async function setResumeActivity(
  step: WorkflowCtx,
  entityId: string,
  label: string,
): Promise<void> {
  await step.runMutation(internal.streaming.internalSet, {
    entityId,
    currentActivity: JSON.stringify([
      { type: "tool", label, status: "active" },
    ]),
  });
}

/**
 * Resolves which sandbox a workflow should resume, and surfaces a "resuming"
 * activity while it happens.
 *
 * Vercel resumes from its own snapshot in roughly 0.3s, so there is nothing to
 * wait on: the actual resume is lazy, via `ensureSandboxRunning` in the start
 * action.
 *
 * Returns `thawId` — the id to reuse, or undefined when there is nothing to
 * resume and the caller should create a fresh sandbox.
 */
export async function ensureSandboxStartedSteps(
  step: WorkflowCtx,
  args: EnsureSandboxStartedArgs,
): Promise<{ thawId: string | undefined }> {
  const thawStartedAt = Date.now();
  console.log(
    `[sandbox] ensureSandboxStartedSteps begin repoId=${args.repoId} sandboxId=${args.sandboxId ?? "none"} streamingEntityId=${args.streamingEntityId ?? "none"}`,
  );
  const thawId = args.sandboxId;
  if (!thawId) {
    console.log(
      `[sandbox] ensureSandboxStartedSteps no thaw id (elapsed=${Date.now() - thawStartedAt}ms)`,
    );
    return { thawId };
  }

  if (args.streamingEntityId && !args.sandboxRunning) {
    await setResumeActivity(
      step,
      args.streamingEntityId,
      "Resuming sandbox...",
    );
  }
  console.log(
    `[sandbox] ensureSandboxStartedSteps skip-kickoff thawId=${thawId} elapsed=${Date.now() - thawStartedAt}ms`,
  );
  return { thawId };
}
