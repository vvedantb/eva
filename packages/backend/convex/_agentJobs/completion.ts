import { defineEvent } from "@convex-dev/workflow";
import { v, type Infer } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { deriveLogUsage } from "../_logs/usage";

/** What a one-shot agent reports when it ends. */
export const agentJobResultValidator = v.object({
  success: v.boolean(),
  result: v.union(v.string(), v.null()),
  error: v.union(v.string(), v.null()),
  activityLog: v.union(v.string(), v.null()),
});

export type AgentJobResult = Infer<typeof agentJobResultValidator>;

/** The one event every one-shot agent job waits on (`runOneShotAgent`). */
export const agentJobCompleteEvent = defineEvent({
  name: "agentJobComplete",
  validator: agentJobResultValidator,
});

/** Inserts a completion log row used by sandbox-callback handlers across workflows. */
export async function recordCompletionLog(
  ctx: MutationCtx,
  params: {
    entityType: string;
    entityId: string;
    entityTitle: string;
    repoId: Id<"githubRepos">;
    rawResultEvent: string | undefined;
    projectId?: Id<"projects">;
  },
): Promise<void> {
  await ctx.db.insert("logs", {
    entityType: params.entityType,
    entityId: params.entityId,
    entityTitle: params.entityTitle,
    rawResultEvent: params.rawResultEvent,
    repoId: params.repoId,
    projectId: params.projectId,
    createdAt: Date.now(),
    ...deriveLogUsage(params.rawResultEvent),
  });
}
