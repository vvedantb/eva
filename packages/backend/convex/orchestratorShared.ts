import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/** Identifies the finished child a master session is being woken about. */
export const orchestratorNotifyChildValidator = v.union(
  v.object({
    kind: v.literal("session"),
    sessionId: v.id("sessions"),
    chatId: v.optional(v.id("sessionChats")),
  }),
  v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
);

/** The `child` payload of `notifyOrchestratorOfChild`, for hook call sites. */
export type OrchestratorNotifyChild =
  | {
      kind: "session";
      sessionId: Id<"sessions">;
      chatId?: Id<"sessionChats">;
    }
  | { kind: "task"; taskId: Id<"agentTasks"> }
  | { kind: "project"; projectId: Id<"projects"> };

/** How much of the child's last message is quoted back to the master. */
export const REPLY_TAIL_CHARS = 500;

/** The optimistic label the queue-drain hook passes when a child goes idle. */
export const DRAIN_IDLE_STATUS = "completed";

function replyTail(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > REPLY_TAIL_CHARS
    ? trimmed.slice(-REPLY_TAIL_CHARS)
    : trimmed;
}

function alertHead(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > REPLY_TAIL_CHARS
    ? `${trimmed.slice(0, REPLY_TAIL_CHARS)}…`
    : trimmed;
}

/** The child's newest non-empty assistant row, as far as the outcome cares. */
export type ChildLastAgentRow = {
  content: string;
  isSystemAlert?: boolean;
  errorDetail?: string;
};

/**
 * What actually happened to the child's last turn, decided from its own newest
 * assistant row rather than taken from the caller.
 *
 * The queue-drain hook can only observe "the child went idle", so it reports
 * `"completed"` for a user cancel and a stall-watchdog kill alike. Both write a
 * system-alert row as the turn's last message, so the transcript is the only
 * place the difference survives — and quoting past the alert (the previous
 * successful reply) told the master a killed turn had succeeded.
 *
 * A caller that already knows what went wrong (e.g. `sandboxError`) passes a
 * specific status, which is kept: flattening it to `"interrupted"` would lose
 * the reason.
 */
export function decideChildOutcome(
  lastAgentRow: ChildLastAgentRow | undefined,
  reportedStatus: string,
): { status: string; tail: string | undefined } {
  if (!lastAgentRow) return { status: reportedStatus, tail: undefined };
  if (lastAgentRow.isSystemAlert === true) {
    const detail = lastAgentRow.errorDetail?.trim();
    return {
      status:
        reportedStatus === DRAIN_IDLE_STATUS ? "interrupted" : reportedStatus,
      tail: alertHead(
        detail ? `${lastAgentRow.content}: ${detail}` : lastAgentRow.content,
      ),
    };
  }
  return { status: reportedStatus, tail: replyTail(lastAgentRow.content) };
}
