import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isEntityArchived } from "../numId";
import {
  handTasksToCoordinator,
  listProjectTasks,
} from "../_projects/scheduler";

/**
 * `dataMigrations:handTriageToEva`, one project: its tasks still waiting in
 * the old Triage (`todo`, never approved) go to its coordinator, as a new
 * ask does (`handTasksToCoordinator`). One wake per project, keyed by the
 * project, so a re-run hands nothing twice and never wakes it twice. An
 * archived project is left as it is.
 */
export async function handProjectTriageToEva(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<number> {
  if (isEntityArchived(project)) return 0;
  const waiting = (await listProjectTasks(ctx.db, project._id)).filter(
    (task) => task.status === "todo" && task.approvedAt === undefined,
  );
  if (waiting.length === 0) return 0;
  const handed = await handTasksToCoordinator(
    ctx,
    project._id,
    waiting.map((task) => task._id),
    `handTriageToEva:${project._id}`,
  );
  return handed.length;
}
