import { hasDependencyCycle } from "@eva/shared/projectStatus";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type DependencyEdge = {
  taskId: Id<"agentTasks">;
  dependsOnId: Id<"agentTasks">;
};

/**
 * Inserts dependency rows (a task → the task it waits for). Refuses the whole
 * set when it would make a cycle, with itself or with the rows already
 * stored: no task in a cycle could ever start (`scheduleReadyTasks`).
 */
export async function insertTaskDependencies(
  ctx: MutationCtx,
  edges: readonly DependencyEdge[],
): Promise<Id<"taskDependencies">[]> {
  const known: Array<readonly [string, string]> = edges.map((edge) => [
    edge.taskId,
    edge.dependsOnId,
  ]);
  // Stored rows reachable from the new targets: only they can close a loop.
  const visited = new Set<string>();
  const pending = edges.map((edge) => edge.dependsOnId);
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (visited.has(id)) continue;
    visited.add(id);
    const current = id;
    const rows = await ctx.db
      .query("taskDependencies")
      .withIndex("by_task", (q) => q.eq("taskId", current))
      .collect();
    for (const row of rows) {
      known.push([row.taskId, row.dependsOnId]);
      pending.push(row.dependsOnId);
    }
  }
  if (hasDependencyCycle(known)) {
    throw new Error(
      "These dependencies make a cycle, so no task in it could ever start.",
    );
  }
  const ids: Id<"taskDependencies">[] = [];
  for (const edge of edges) {
    ids.push(await ctx.db.insert("taskDependencies", edge));
  }
  return ids;
}
