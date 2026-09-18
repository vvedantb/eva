<<<<<<< HEAD
﻿import { entityPathSegment } from "@/lib/numId";
import { repoHref, toInternalRepoHref } from "@/lib/utils/repoUrl";

/** The repo/app identity these path helpers read — `githubRepos.list` rows fit. */
export interface RepoPathRef {
  owner: string;
  name: string;
  rootDirectory?: string;
}

/**
 * A sidebar session row. `linkedFrom` is set only on rows a repo sees through
 * a linked checkout: the session's own (primary) repo owns its URL.
 */
export interface SessionRowRef {
  numId?: number;
  linkedFrom?: RepoPathRef;
}
=======
﻿import { repoHref } from "@/lib/utils/repoUrl";

/**
 * The only fields these helpers read off a repo row, so callers holding just a
 * repo's identity (and tests) do not have to carry the whole Convex document.
 */
export type RepoPathParts = {
  owner: string;
  name: string;
  rootDirectory?: string;
};
>>>>>>> origin/main

/**
 * Base path(s) for a repo/app row. Public slash form plus internal `--` form
 * so path matching works against both `publicHref` and `location.pathname`.
 */
<<<<<<< HEAD
export function repoBasePaths(repo: RepoPathRef): string[] {
=======
export function repoBasePaths(repo: RepoPathParts): string[] {
>>>>>>> origin/main
  const slash = repoHref(repo.owner, repo.name, repo.rootDirectory);
  if (!repo.rootDirectory) return [slash];
  const leaf = repo.rootDirectory.split("/").pop();
  if (!leaf) return [slash];
  const internal = `/${repo.owner}/${repo.name}--${leaf}`;
  return slash === internal ? [slash] : [slash, internal];
}

/** Sessions index URL for an app (`â€¦/sessions` composer landing). */
<<<<<<< HEAD
export function repoSessionsIndexPath(repo: RepoPathRef): string {
=======
export function repoSessionsIndexPath(repo: RepoPathParts): string {
>>>>>>> origin/main
  return `${repoHref(repo.owner, repo.name, repo.rootDirectory)}/sessions`;
}

/** Whether `pathname` is under this repo/app (any sub-page). */
<<<<<<< HEAD
export function repoMatchesPath(repo: RepoPathRef, pathname: string): boolean {
=======
export function repoMatchesPath(repo: RepoPathParts, pathname: string): boolean {
>>>>>>> origin/main
  return repoBasePaths(repo).some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/**
 * The repo whose URL a row's session lives under. A row shown in this app's
 * sidebar only because the session clones this repo still belongs to the
 * session's primary repo, so its link and selection must resolve there.
 */
<<<<<<< HEAD
function sessionRowRepo(
  repo: RepoPathRef,
  session: SessionRowRef,
): RepoPathRef {
  return session.linkedFrom ?? repo;
}

/**
 * Router href for a session row, or the app's sessions index when the row has
 * no numId yet. The single place a row's destination is decided â€” linked-in
 * rows resolve under their primary repo, not the sidebar they appear in.
 */
export function sessionHrefForRow(
  repo: RepoPathRef,
  session: SessionRowRef,
): string {
  const owning = sessionRowRepo(repo, session);
  const base = `${repoHref(owning.owner, owning.name, owning.rootDirectory)}/sessions`;
  const segment = entityPathSegment(session);
  return toInternalRepoHref(segment ? `${base}/${segment}` : base);
}

/**
 * Whether `pathname` is this row's session. Checks slash + `--` bases â€”
 * `location.pathname` is the router-internal form â€” under the same repo
 * {@link sessionHrefForRow} links to.
 */
export function sessionRowMatchesPath(
  repo: RepoPathRef,
  session: SessionRowRef,
=======
export function sessionMatchesPath(
  repo: RepoPathParts,
  pathSegment: string | null | undefined,
>>>>>>> origin/main
  pathname: string,
): boolean {
  const segment = entityPathSegment(session);
  if (!segment) return false;
  return repoBasePaths(sessionRowRepo(repo, session)).some((base) => {
    const href = `${base}/sessions/${segment}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}
