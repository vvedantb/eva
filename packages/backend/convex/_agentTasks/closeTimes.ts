import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type CloseState = Pick<
  Doc<"agentTasks">,
  "status" | "prState" | "archivedAt" | "shippedAt" | "closedAt"
>;

/** Its PR merged, or a person or the merge webhook marked it Done. */
export function taskShipped(task: Pick<Doc<"agentTasks">, "status" | "prState">): boolean {
  return task.status === "done" || task.prState === "merged";
}

/** It left the open list: shipped, cancelled or archived. */
export function taskClosed(task: Pick<Doc<"agentTasks">, "status" | "prState" | "archivedAt">): boolean {
  return taskShipped(task) || task.status === "cancelled" || task.archivedAt !== undefined;
}

/**
 * The `shippedAt` / `closedAt` patch that makes them match the task's state
 * now: stamped at `now` when it ships or closes, cleared when it reopens,
 * left alone otherwise. Null when nothing changes.
 */
export function taskCloseTimesPatch(
  task: CloseState,
  now: number,
): Pick<Doc<"agentTasks">, "shippedAt" | "closedAt"> | null {
  const shipped = taskShipped(task);
  const closed = taskClosed(task);
  const shippedAt = shipped ? (task.shippedAt ?? now) : undefined;
  const closedAt = closed ? (task.closedAt ?? shippedAt ?? now) : undefined;
  return shippedAt === task.shippedAt && closedAt === task.closedAt
    ? null
    : { shippedAt, closedAt };
}

/**
 * Keeps a task's ship and close times in step with its status, PR and
 * archive. Reads the stored task, so it is safe to call after any write that
 * may open or close it: the status setters, the PR summary sync, archive
 * and unarchive. The project progress chart reads these times.
 */
export async function reconcileTaskCloseTimes(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task) return;
  const patch = taskCloseTimesPatch(task, Date.now());
  if (patch) await ctx.db.patch(taskId, patch);
}

/**
 * Ship and close times for a task closed before they were stamped, best
 * effort: the last status change to Done or Cancelled in its activity log,
 * its merged PR's last update, its archive time, else its last update.
 * Null when the task is open or already stamped. For `backfillTaskCloseTimes`.
 */
export async function backfilledCloseTimes(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<Pick<Doc<"agentTasks">, "shippedAt" | "closedAt"> | null> {
  if (!taskClosed(task) || task.closedAt !== undefined) return null;
  const [activity, prs] = await Promise.all([
    ctx.db
      .query("taskActivity")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect(),
    ctx.db
      .query("pullRequests")
      .withIndex("by_task", (q) => q.eq("owner.taskId", task._id))
      .collect(),
  ]);
  const lastStatusTo = (status: string) =>
    activity
      .filter((row) => row.field === "status" && row.newValue === status)
      .reduce<number | undefined>(
        (latest, row) => Math.max(latest ?? 0, row.createdAt),
        undefined,
      );
  const mergedAt = prs
    .filter((pr) => pr.state === "merged")
    .reduce<number | undefined>(
      (latest, pr) => Math.max(latest ?? 0, pr.updatedAt),
      undefined,
    );
  const shippedAt = taskShipped(task)
    ? (lastStatusTo("done") ?? mergedAt ?? task.updatedAt)
    : undefined;
  const closedAt =
    shippedAt ??
    (task.status === "cancelled" ? lastStatusTo("cancelled") : undefined) ??
    task.archivedAt ??
    task.updatedAt;
  return { shippedAt, closedAt };
}
