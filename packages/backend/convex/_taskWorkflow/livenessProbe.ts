import { v } from "convex/values";
import { internalAction } from "../_generated/server";

/**
 * No-op stub. The run's durable turn lease (`turns.reconcile`) probes liveness
 * now. Kept for one release because jobs scheduled before durable run turns
 * still call it; delete it one release after this change.
 */
export const probeStaleRunLiveness = internalAction({
  args: {
    runId: v.id("agentRuns"),
    taskId: v.id("agentTasks"),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    streamingAgeMs: v.number(),
    finishingInProgress: v.boolean(),
  },
  returns: v.null(),
  handler: async () => null,
});
