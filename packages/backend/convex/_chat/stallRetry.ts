import type { Doc } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";

/**
 * Whether a stalled chat turn should be restaged without a new user bubble.
 *
 * claimPendingTurn acquires the 2-minute running lease before the daemon has
 * started heartbeating it. If the process then dies (huge Claude resume after
 * sandbox reconnect is the observed case), the prompt is gone: the empty
 * assistant bubble is dropped, and the next send is a different turn. Retry
 * once, only when the stall produced no output and nothing else is already
 * running or queued.
 *
 * Retry is scheduled after finalizeExpired inserts the stall alert, so the
 * first failure already counts as 1. A second stall of the same prompt is 2.
 */

export const STALL_ALERT_TEXT =
  "Turn stalled: the agent process in the sandbox stopped responding.";

export function isStallAlert(message: {
  role: string;
  content?: string;
  isSystemAlert?: boolean;
}): boolean {
  return (
    message.role === "assistant" && message.content === STALL_ALERT_TEXT
  );
}

export function shouldRetryEmptyStall(input: {
  sandboxStopped: boolean;
  hasActiveWorkflow: boolean;
  stallAlertsAfterLastUser: number;
  lastUserContent: string | undefined;
  hasSalvagedOutput: boolean;
}): boolean {
  if (input.sandboxStopped) return false;
  if (input.hasActiveWorkflow) return false;
  if (input.hasSalvagedOutput) return false;
  if (input.stallAlertsAfterLastUser !== 1) return false;
  if (input.lastUserContent === undefined || input.lastUserContent.length === 0)
    return false;
  return true;
}

/** Walk newest-first messages until the last user row. */
export function countStallAlertsAfterLastUser(
  messages: Array<{
    role: string;
    content?: string;
    activityLog?: string;
    isSystemAlert?: boolean;
  }>,
): {
  stallAlertsAfterLastUser: number;
  lastUserContent: string | undefined;
  hasSalvagedOutput: boolean;
} {
  let stallAlertsAfterLastUser = 0;
  let hasSalvagedOutput = false;
  for (const message of messages) {
    if (message.role === "user") {
      return {
        stallAlertsAfterLastUser,
        lastUserContent:
          typeof message.content === "string" ? message.content : undefined,
        hasSalvagedOutput,
      };
    }
    if (isStallAlert(message)) {
      stallAlertsAfterLastUser += 1;
      continue;
    }
    if (message.role === "assistant") {
      const content =
        typeof message.content === "string" ? message.content : "";
      const activityLog =
        typeof message.activityLog === "string" ? message.activityLog : "";
      if (content.length > 0 || activityLog.length > 0) {
        hasSalvagedOutput = true;
      }
    }
  }
  return {
    stallAlertsAfterLastUser,
    lastUserContent: undefined,
    hasSalvagedOutput,
  };
}

/**
 * The last user prompt to restage after an empty stall, or null when the stall
 * must stay failed. Shared by the session, task-chat and project-chat retries,
 * which each run it from their adapter's `afterStallFinalize`.
 */
export async function emptyStallRetryPrompt(
  db: DatabaseReader,
  params: {
    parentId: Doc<"messages">["parentId"];
    sandboxStopped: boolean;
    hasActiveWorkflow: boolean;
  },
): Promise<string | null> {
  const messages = await db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", params.parentId))
    .order("desc")
    .take(20);
  const counted = countStallAlertsAfterLastUser(messages);
  if (
    !shouldRetryEmptyStall({
      sandboxStopped: params.sandboxStopped,
      hasActiveWorkflow: params.hasActiveWorkflow,
      stallAlertsAfterLastUser: counted.stallAlertsAfterLastUser,
      lastUserContent: counted.lastUserContent,
      hasSalvagedOutput: counted.hasSalvagedOutput,
    })
  ) {
    return null;
  }
  return counted.lastUserContent ?? null;
}
