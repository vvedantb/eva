import type { DatabaseReader } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";

type RepoBaseBranchSource = Pick<
  Doc<"githubRepos">,
  "defaultBaseBranch"
> | null;
type ProjectBaseBranchSource =
  | Pick<Doc<"projects">, "baseBranch">
  | null
  | undefined;

// Returns the first candidate that is non-empty after trimming, else the
// configured fallback. Callers pass candidates in priority order.
function firstBranchOrFallback(
  ...candidates: Array<string | undefined>
): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return FALLBACK_GIT_BASE_BRANCH;
}

export function resolveTaskWorkflowBaseBranch(
  task: Pick<Doc<"agentTasks">, "baseBranch" | "projectId">,
  repo: RepoBaseBranchSource,
  project?: ProjectBaseBranchSource,
): string {
  return firstBranchOrFallback(
    task.projectId ? project?.baseBranch : undefined,
    task.baseBranch,
    repo?.defaultBaseBranch,
  );
}

export async function resolveTaskWorkflowBaseBranchForTask(
  db: DatabaseReader,
  task: Pick<Doc<"agentTasks">, "baseBranch" | "projectId">,
  repo: RepoBaseBranchSource,
): Promise<string> {
  const project = task.projectId ? await db.get(task.projectId) : null;
  return firstBranchOrFallback(
    project?.baseBranch,
    task.baseBranch,
    repo?.defaultBaseBranch,
  );
}

export function resolveNewTaskBaseBranch(
  explicitBaseBranch: string | undefined,
  repo: RepoBaseBranchSource,
  project?: ProjectBaseBranchSource,
): string {
  return firstBranchOrFallback(
    explicitBaseBranch,
    project?.baseBranch,
    repo?.defaultBaseBranch,
  );
}

export function resolveProjectBaseBranch(
  project: Pick<Doc<"projects">, "baseBranch">,
  repo: RepoBaseBranchSource,
): string {
  return firstBranchOrFallback(project.baseBranch, repo?.defaultBaseBranch);
}
