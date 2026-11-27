import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type AIProvider, type Id } from "@eva/backend";
import { harnessCatalogProvider, skillSlashItems } from "@eva/shared";
import type { SlashItem } from "@/lib/components/mentions";

/**
 * The `/` skill list for a repo: skills synced from `.agents/skills`, the Eva
 * system skills installed on this repo, then the harness built-ins. The phone
 * composer loads the same three queries (see `skillSlashItems`).
 */
export function useSkillSlashItems(
  /** Undefined (Manager Ave, no codebase): the `/` menu is empty. */
  repoId: Id<"githubRepos"> | undefined,
  provider?: AIProvider,
): SlashItem[] {
  const repoSkills =
    useQuery(api.repoSkills.listByRepo, repoId ? { repoId } : "skip") ?? [];
  const systemSkills =
    useQuery(api.repoSystemSkills.listForRepo, repoId ? { repoId } : "skip") ??
    [];
  const catalogProvider = harnessCatalogProvider(provider);
  // The harness's own catalog, reported by the sandboxes that run it. Global,
  // so it is keyed by provider rather than repo.
  const harnessCatalog = useQuery(
    api.harnessSkills.getForProvider,
    catalogProvider && repoId ? { provider: catalogProvider } : "skip",
  );
  if (repoId === undefined) return [];
  return skillSlashItems(
    repoSkills,
    systemSkills,
    provider,
    harnessCatalog?.skills,
  );
}
