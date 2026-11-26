import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";

/** The scoped repo, its logo and its team's header art. */
export function useSidebarRepoData(
  owner: string | null,
  repoName: string | null,
  appName: string | undefined,
) {
  const repo = useQuery(
    api.githubRepos.getByOwnerAndName,
    owner && repoName ? { owner, name: repoName, appName } : "skip",
  );
  const repoLogoUrl = useQuery(
    api.githubRepos.getLogoUrl,
    repo?._id ? { repoId: repo._id } : "skip",
  );
  const team = useQuery(
    api.teams.get,
    repo?.teamId ? { id: repo.teamId } : "skip",
  );
  const teamBackgroundUrl = team?.backgroundUrl ?? null;
  return { repo, repoLogoUrl, teamBackgroundUrl };
}
