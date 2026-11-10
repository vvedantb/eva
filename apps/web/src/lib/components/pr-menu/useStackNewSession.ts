import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { repoHref, toInternalRepoHref } from "@/lib/utils/repoUrl";

/**
 * "Stack a new session" on a pull request: opens the new-session composer of
 * the PR's repo on its head branch, and the session's PR then joins that PR's
 * GitHub stack (`linkSessionPrToStack`). The repo comes from the cached repo
 * list rather than the route, so the global sidebar's menus can offer it too.
 */
export function useStackNewSession() {
  const navigate = useNavigate();
  const repos = useQuery(api.githubRepos.list, {});
  const find = (repoId: Id<"githubRepos">) =>
    repos?.find((repo) => repo._id === repoId);

  return {
    canStack: (repoId: Id<"githubRepos">) => find(repoId) !== undefined,
    stack: (pr: {
      repoId: Id<"githubRepos">;
      prNumber: number;
      headRef: string;
    }) => {
      const repo = find(pr.repoId);
      if (repo === undefined) return;
      const basePath = repoHref(repo.owner, repo.name, repo.rootDirectory);
      void navigate({
        to: toInternalRepoHref(`${basePath}/sessions`),
        search: { stackOn: pr.prNumber, stackBase: pr.headRef },
      });
    },
  };
}
