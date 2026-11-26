import type { Id } from "../_generated/dataModel";

/**
 * Streaming-row ids of the agents that are not chats (a task run is a chat
 * turn, `_agentTasks/taskRunTurn.ts`). A durable turn stores its
 * own `streamingEntityId`; these prefixes let the old heartbeat gate map a row
 * back to its turn owner. Doc interview, test generation, evaluation and
 * project interview stream under the bare row id.
 */
export const AUTOMATION_RUN_STREAM_PREFIX = "automation-run-";
export const PR_RECAP_STREAM_PREFIX = "pr-recap:";

export function automationRunStreamingEntityId(
  runId: Id<"automationRuns">,
): string {
  return `${AUTOMATION_RUN_STREAM_PREFIX}${String(runId)}`;
}

export function prRecapStreamingEntityId(docId: Id<"docs">): string {
  return `${PR_RECAP_STREAM_PREFIX}${String(docId)}`;
}
