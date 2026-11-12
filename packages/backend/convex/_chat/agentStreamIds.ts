import type { Id } from "../_generated/dataModel";

/**
 * Streaming-row ids of the agents that are not chats. A durable turn stores its
 * own `streamingEntityId`; these prefixes let the old heartbeat gate map a row
 * back to its turn owner. Doc interview, test generation, evaluation and
 * project interview stream under the bare row id.
 */
export const TASK_RUN_STREAM_PREFIX = "task-run-";
export const AUTOMATION_RUN_STREAM_PREFIX = "automation-run-";
export const PR_RECAP_STREAM_PREFIX = "pr-recap:";
export const SESSION_SUMMARY_STREAM_PREFIX = "summary:";

export function automationRunStreamingEntityId(
  runId: Id<"automationRuns">,
): string {
  return `${AUTOMATION_RUN_STREAM_PREFIX}${String(runId)}`;
}

export function prRecapStreamingEntityId(docId: Id<"docs">): string {
  return `${PR_RECAP_STREAM_PREFIX}${String(docId)}`;
}

export function sessionSummaryStreamingEntityId(
  sessionId: Id<"sessions">,
): string {
  return `${SESSION_SUMMARY_STREAM_PREFIX}${String(sessionId)}`;
}
