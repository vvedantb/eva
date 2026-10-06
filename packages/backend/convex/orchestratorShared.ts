import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Leaf module for the orchestrator-notify hook surface. The turn-finish call
// sites (`_taskWorkflow/helpers.ts`, `_taskWorkflow/publicMutations.ts`) import
// from here rather than `orchestratorNotify.ts`, whose own imports (workflow
// manager, watchdog, streaming helpers) would otherwise close import cycles in
// the "use node" action chunk and break the prod push.

/** Identifies the finished child a master session is being woken about. */
export const orchestratorNotifyChildValidator = v.union(
  v.object({ kind: v.literal("session"), sessionId: v.id("sessions") }),
  v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
);

/** The `child` payload of `notifyOrchestratorOfChild`, for hook call sites. */
export type OrchestratorNotifyChild =
  | { kind: "session"; sessionId: Id<"sessions"> }
  | { kind: "task"; taskId: Id<"agentTasks"> }
  | { kind: "project"; projectId: Id<"projects"> };

/**
 * Schedules a master wake-up for a finished quick-task run. No-op when the task
 * is not watched, so run completion pays one read and nothing else.
 */
export async function scheduleTaskOrchestratorNotify(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  status: string,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task || task.watchedByAve === undefined) return;
  await ctx.scheduler.runAfter(
    0,
    internal.orchestratorNotify.notifyOrchestratorOfChild,
    { child: { kind: "task", taskId }, status },
  );
}

/** How much of the child's last message is quoted back to the master. */
export const REPLY_TAIL_CHARS = 500;

/** The optimistic label the queue-drain hook passes when a child goes idle. */
export const DRAIN_IDLE_STATUS = "completed";

/**
 * Trims a quoted child reply to its tail — a reply's conclusion is at the end.
 */
function replyTail(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > REPLY_TAIL_CHARS
    ? trimmed.slice(-REPLY_TAIL_CHARS)
    : trimmed;
}

/**
 * Opposite trim for a failure: an alert's meaning is in its first line, and its
 * `errorDetail` usually ends in a stack trace. Tailing one quoted a bare
 * `HX5DX.js:634:28)` fragment at the master, which says nothing about what
 * broke.
 */
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
