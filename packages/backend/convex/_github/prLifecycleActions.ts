import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

export type PrLifecycleBaseArgs = {
  installationId: number;
  repoOwner: string;
  repoName: string;
  prNumber: number;
};

export type PrLifecycleTransition =
  | { kind: "close" }
  | { kind: "reopen"; asReady: boolean }
  | { kind: "ready" }
  | { kind: "draft" };

/**
 * Schedules the GitHub PR lifecycle action that matches a domain transition.
 * Callers decide *when* (phase/status rules); this owns *how* the four
 * taskWorkflowActions are invoked.
 */
export async function schedulePrLifecycleActions(
  ctx: Pick<MutationCtx, "scheduler">,
  baseArgs: PrLifecycleBaseArgs,
  transition: PrLifecycleTransition,
): Promise<void> {
  if (transition.kind === "close") {
    await ctx.scheduler.runAfter(
      0,
      internal.taskWorkflowActions.closePullRequest,
      baseArgs,
    );
    return;
  }
  if (transition.kind === "reopen") {
    await ctx.scheduler.runAfter(
      0,
      internal.taskWorkflowActions.reopenPullRequest,
      { ...baseArgs, asReady: transition.asReady },
    );
    return;
  }
  if (transition.kind === "ready") {
    await ctx.scheduler.runAfter(
      0,
      internal.taskWorkflowActions.markPrReadyForReview,
      baseArgs,
    );
    return;
  }
  await ctx.scheduler.runAfter(
    0,
    internal.taskWorkflowActions.convertPrToDraft,
    baseArgs,
  );
}

/** Picks the GitHub action for a 4-way phase/status transition, or null. */
export function selectPrLifecycleTransition(params: {
  enteringCancelled: boolean;
  leavingCancelled: boolean;
  enteringCodeReview: boolean;
  leavingCodeReview: boolean;
  asReadyOnReopen: boolean;
}): PrLifecycleTransition | null {
  if (params.enteringCancelled) return { kind: "close" };
  if (params.leavingCancelled) {
    return { kind: "reopen", asReady: params.asReadyOnReopen };
  }
  if (params.enteringCodeReview) return { kind: "ready" };
  if (params.leavingCodeReview) return { kind: "draft" };
  return null;
}
