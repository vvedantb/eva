import type { Doc } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";

import { taskHasRun } from "./runSummary";

const PREVIEW_ALLOWED_STATUSES = [
  // A run was asked for: its turn needs the sandbox.
  "in_progress",
  "code_review",
  "business_review",
  "done",
] as const;

/**
 * Whether a task may start a sandbox it does not have yet. A running task and
 * review statuses always may. A task moved back to `todo` after it already ran keeps
 * its branch, so it previews like a reviewed task instead of offering a first
 * run again (mirrors `canStartSandbox` in `useTaskDetail`). Read by the
 * task session's Start (`sessions.startSandbox`).
 */
export async function isPreviewSandboxAllowed(
  db: DatabaseReader,
  task: Doc<"agentTasks">,
): Promise<boolean> {
  if (PREVIEW_ALLOWED_STATUSES.some((status) => status === task.status)) {
    return true;
  }
  return task.status === "todo" && (await taskHasRun(db, task._id));
}

/** The error a disallowed preview start throws. */
export function previewSandboxNotAllowedError(
  task: Pick<Doc<"agentTasks">, "status">,
): Error {
  return new Error(
    `Task must be running, in code_review, business_review or done status, or have run before, to start sandbox. Current status: ${task.status}`,
  );
}
