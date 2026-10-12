/** Canonical GitHub PR URL for an owner/repo + PR number. */
export function githubPrUrl(
  owner: string,
  repoName: string,
  prNumber: number,
): string {
  return `https://github.com/${owner}/${repoName}/pull/${prNumber}`;
}

/** True for a PR that is still open or draft. */
export function isLivePrState(
  state: "draft" | "open" | "merged" | "closed" | undefined,
): boolean {
  return state === "draft" || state === "open";
}

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

/** Parse a positive PR number from a GitHub pull URL, or undefined if absent/invalid. */
export function prNumberFromGithubUrl(prUrl: string): number | undefined {
  const match = /\/pull\/(\d+)(?:\/|$|\?|#)/.exec(prUrl);
  if (match === null) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
