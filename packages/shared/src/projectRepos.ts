import { projectsRepoFilterKey, type RepoPathFields } from "./repoPath";

// The root Projects pages list every project the caller can open
// (`projects.listAccessible`); web and phone join each row to its home repo
// and filter by repo the same way.

/** A repo row as the project pages read it (`githubRepos.list`). */
export interface ProjectHomeRepo extends RepoPathFields {
  _id: string;
}

/**
 * Each project with its home repo, in list order. A project whose repo is not
 * in `repos` (hidden from the rail) is left out.
 */
export function withHomeRepos<P extends { repoId: string }, R extends ProjectHomeRepo>(
  projects: readonly P[],
  repos: readonly R[],
): Array<{ project: P; repo: R }> {
  const byId = new Map(repos.map((repo) => [repo._id, repo]));
  return projects.flatMap((project) => {
    const repo = byId.get(project.repoId);
    return repo === undefined ? [] : [{ project, repo }];
  });
}

/**
 * The repo a `?repo=` filter names (`projectsRepoFilterKey`), or null for all
 * repos. A key that names no repo the caller has also means all repos.
 */
export function repoForProjectsFilter<R extends ProjectHomeRepo>(
  repos: readonly R[],
  key: string | null | undefined,
): R | null {
  if (!key) return null;
  return repos.find((repo) => projectsRepoFilterKey(repo) === key) ?? null;
}
