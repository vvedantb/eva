import type { Doc } from "../_generated/dataModel";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";

type RepoBaseBranchSource = Pick<
  Doc<"githubRepos">,
  "defaultBaseBranch"
> | null;

function firstBranchOrFallback(
  ...candidates: Array<string | undefined>
): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return FALLBACK_GIT_BASE_BRANCH;
}

/**
 * The branch a task's run works from and opens its PR to: the task's own
 * base, else the repo default. A project's child task follows the same rule
 * (its PR goes straight to main), never the project's branch.
 */
export function resolveTaskWorkflowBaseBranch(
  task: Pick<Doc<"agentTasks">, "baseBranch">,
  repo: RepoBaseBranchSource,
): string {
  return firstBranchOrFallback(task.baseBranch, repo?.defaultBaseBranch);
}

/** A new task's base branch: the explicit pick, else the repo default. */
export function resolveNewTaskBaseBranch(
  explicitBaseBranch: string | undefined,
  repo: RepoBaseBranchSource,
): string {
  return firstBranchOrFallback(explicitBaseBranch, repo?.defaultBaseBranch);
}

/** A project's base branch; a blank one counts as missing. */
export function resolveProjectBaseBranch(
  project: Pick<Doc<"projects">, "baseBranch">,
  repo: RepoBaseBranchSource,
): string {
  return firstBranchOrFallback(project.baseBranch, repo?.defaultBaseBranch);
}
