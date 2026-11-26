/**
 * The PR a task's chrome links to: its own primary PR for a quick task, the
 * project's for a project task (a project task's PRs belong to its project).
 */
export function taskPrUrl(
  task: { prUrl?: string; projectId?: string } | null | undefined,
  projects: ReadonlyArray<{ _id: string; prUrl?: string }> | undefined,
): string | undefined {
  if (!task) return undefined;
  if (task.projectId === undefined) return task.prUrl;
  return projects?.find((project) => project._id === task.projectId)?.prUrl;
}

