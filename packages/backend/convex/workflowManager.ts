import { WorkflowManager, type WorkflowId } from "@convex-dev/workflow";
import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

/** Shared workflow manager instance with retry and parallelism configuration. */
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 1000,
      base: 2,
    },
    retryActionsByDefault: true,
    // Shared across every workflow type (sessions, tasks, design, projects…).
    // At 10, a burst of concurrent turns queued steps behind each other and a
    // warm session turn's handoff could wait 10s+ in the pool — the "slow hi".
    // Raised to cut that head-of-line wait; Convex scales the functions, this
    // cap is backpressure, not a hard resource limit.
    maxParallelism: 30,
  },
});

/**
 * Brands a plain workflow-id string back into the library's opaque `WorkflowId`.
 * Convex persists workflow ids with `v.string()`, so a stored id is read back as
 * a plain string with no non-assertion way to recover the brand. This is the
 * single, contained assertion for that third-party-type gap.
 */
export function toWorkflowId(workflowId: string): WorkflowId {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- WorkflowId is an opaque branded type from @convex-dev/workflow; Convex stores it as v.string() so there is no non-assertion way to recover the brand
  return workflowId as WorkflowId;
}

/**
 * True while a tracked workflow is still running. A slot left by a workflow
 * that crashed or finished without clearing it reads as free, so a busy guard
 * never locks the user out until the `RUN_TIMEOUT_MS` watchdog runs.
 */
export async function isTrackedWorkflowRunning(
  ctx: MutationCtx,
  workflowId: string | undefined,
): Promise<boolean> {
  if (!workflowId) return false;
  try {
    const status = await workflow.status(ctx, toWorkflowId(workflowId));
    return status.type === "inProgress";
  } catch {
    // Unknown id (cleaned up by the component): nothing is running.
    return false;
  }
}

/** Cancels a tracked workflow, swallowing errors when it has already completed or been cancelled. */
export async function cancelTrackedWorkflow(
  ctx: MutationCtx,
  workflowId: string | undefined,
): Promise<void> {
  if (!workflowId) return;
  try {
    await workflow.cancel(ctx, toWorkflowId(workflowId));
  } catch {
    // Workflow may have already completed or been cancelled
  }
}
