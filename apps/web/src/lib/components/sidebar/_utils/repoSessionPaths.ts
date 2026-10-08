import { repoHref } from "@/lib/utils/repoUrl";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

/**
 * Base path(s) for a repo/app row. Public slash form plus internal `--` form
 * so path matching works against both `publicHref` and `location.pathname`.
 */
export function repoBasePaths(repo: RepoWithLogo): string[] {
  const slash = repoHref(repo.owner, repo.name, repo.rootDirectory);
  if (!repo.rootDirectory) return [slash];
  const leaf = repo.rootDirectory.split("/").pop();
  if (!leaf) return [slash];
  const internal = `/${repo.owner}/${repo.name}--${leaf}`;
  return slash === internal ? [slash] : [slash, internal];
}

/** Sessions index URL for an app (`â€¦/sessions` composer landing). */
export function repoSessionsIndexPath(repo: RepoWithLogo): string {
  return `${repoHref(repo.owner, repo.name, repo.rootDirectory)}/sessions`;
}

/** Whether `pathname` is under this repo/app (any sub-page). */
export function repoMatchesPath(repo: RepoWithLogo, pathname: string): boolean {
  return repoBasePaths(repo).some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/**
 * Whether `pathname` is this session under the app. Checks slash + `--`
 * bases â€” `location.pathname` is the router-internal form.
 */
export function sessionMatchesPath(
  repo: RepoWithLogo,
  pathSegment: string | null | undefined,
  pathname: string,
): boolean {
  if (!pathSegment) return false;
  return repoBasePaths(repo).some((base) => {
    const href = `${base}/sessions/${pathSegment}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}

/**
 * Which row of a session is selected for the current URL: the session row
 * while Main (no `?chat` or `?chat=1`) is open, otherwise the chat row with
 * that number. Both never highlight at once.
 */
export function selectedChatNumber(chatParam: number | null): number {
  return chatParam === null ? 1 : chatParam;
}
