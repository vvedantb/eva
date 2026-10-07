import { repoBasePaths } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

/**
 * Whether `pathname` is this automation under the app. Checks slash + `--`
 * bases — `location.pathname` is the router-internal form. Exact segment match
 * so automation `1` does not stay lit while viewing `11`.
 */
export function automationMatchesPath(
  repo: RepoWithLogo,
  pathSegment: string | null | undefined,
  pathname: string,
): boolean {
  if (!pathSegment) return false;
  return repoBasePaths(repo).some((base) => {
    const href = `${base}/automations/${pathSegment}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}
