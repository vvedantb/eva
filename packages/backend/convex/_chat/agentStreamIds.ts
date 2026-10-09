import type { Id } from "../_generated/dataModel";

/**
 * Streaming-row ids of every prefixed agent stream: task and project chats plus
 * the agents that are not chats. A durable turn stores its own
 * `streamingEntityId`; these prefixes let the old heartbeat gate map a row back
 * to its turn owner. Sessions, doc interview, test generation, evaluation and
 * project interview stream under the bare row id. Leaf module: no imports
 * beyond `_generated` types, so any `_chat`/`_queues` module can use it.
 */
/** Streaming entityId prefix for project chat workflows. */
export const PROJECT_CHAT_STREAM_PREFIX = "project-chat-";
/** Streaming entityId prefix for agent task chat workflows. */
export const TASK_CHAT_STREAM_PREFIX = "task-chat-";
export const TASK_RUN_STREAM_PREFIX = "task-run-";
export const AUTOMATION_RUN_STREAM_PREFIX = "automation-run-";
export const PR_RECAP_STREAM_PREFIX = "pr-recap:";
export const SESSION_SUMMARY_STREAM_PREFIX = "summary:";

/** streamingActivity entityId for an agent task's chat turn. */
export function taskChatStreamEntityId(id: Id<"agentTasks">): string {
  return `${TASK_CHAT_STREAM_PREFIX}${String(id)}`;
}

/** streamingActivity entityId for a project's chat turn. */
export function projectChatStreamEntityId(id: Id<"projects">): string {
  return `${PROJECT_CHAT_STREAM_PREFIX}${String(id)}`;
}

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
