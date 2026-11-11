import type { Doc } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";

const PREVIEW_ALLOWED_STATUSES = [
  "code_review",
  "business_review",
  "done",
] as const;

/**
 * Whether a task may start a preview sandbox it does not have yet. Review
 * statuses always may. A task moved back to `todo` after it already ran keeps
 * its branch, so it previews like a reviewed task instead of offering a first
 * run again (mirrors `canStartSandbox` in `useTaskDetail`). Shared by the
 * task's own Start (`startTaskSandbox`) and its session's (`sessions.startSandbox`).
 */
export async function isPreviewSandboxAllowed(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  if (PREVIEW_ALLOWED_STATUSES.some((status) => status === task.status)) {
    return true;
  }
  if (task.status !== "todo") return false;
  const run = await db
    .query("agentRuns")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .first();
  return run !== null;
}

/** The error a disallowed preview start throws. */
export function previewSandboxNotAllowedError(
  task: Pick<Doc<"agentTasks">, "status">,
): Error {
  return new Error(
    `Task must be in code_review, business_review or done status, or have run before, to start sandbox. Current status: ${task.status}`,
  );
}
