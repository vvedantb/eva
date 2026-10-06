import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type AIProvider, type Id } from "@eva/backend";
import {
  type SlashItem,
  systemSkillTokenId,
  harnessSkillTokenId,
  harnessSkillsForProvider,
} from "@/lib/components/mentions";
import {
  harnessCatalogProvider,
  harnessProviderMetadata,
  type HarnessSkill,
} from "@/lib/components/mentions/harnessSkills";

/**
 * The `/` skill list for a repo: skills synced from `.agents/skills` plus the
 * Eva system skills installed on this repo.
 *
 * The label is what the backend strips a chip down to, so a system skill must
 * be labelled with its raw registry name (`eva-capture`) — that is the name the
 * agent's skill directory carries in the sandbox.
 */
export function isClaudeSkillSourcePath(
  sourcePath: string | undefined,
): boolean {
  return sourcePath?.startsWith(".claude/skills/") === true;
}

interface RepoSkillCandidate {
  title: string;
  sourcePath?: string;
  available: boolean;
}

export function selectRepoSkillsForProvider<TSkill extends RepoSkillCandidate>(
  skills: ReadonlyArray<TSkill>,
  provider: AIProvider | undefined,
): TSkill[] {
  const available = skills.filter((skill) => skill.available);
  const genericTitles = new Set(
    available
      .filter((skill) => !isClaudeSkillSourcePath(skill.sourcePath))
      .map((skill) => skill.title),
  );
  const claudeTitles = new Set(
    available
      .filter((skill) => isClaudeSkillSourcePath(skill.sourcePath))
      .map((skill) => skill.title),
  );

  return available.filter((skill) => {
    const claudeOnly = isClaudeSkillSourcePath(skill.sourcePath);
    if (provider === "claude") {
      return claudeOnly || !claudeTitles.has(skill.title);
    }
    if (provider !== undefined) return !claudeOnly;
    return !claudeOnly || !genericTitles.has(skill.title);
  });
}

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

  const selectedRepoSkills = selectRepoSkillsForProvider(repoSkills, provider);
  const repoItems: SlashItem[] = selectedRepoSkills.map((skill) => ({
    id: skill._id,
    label: skill.title,
    description: skill.description,
    ...(isClaudeSkillSourcePath(skill.sourcePath)
      ? { badge: "Claude", provider: "claude" }
      : {}),
  }));

  // A repo skill of the same name shadows the Eva one — the sandbox
  // materializer leaves user-owned skill directories alone.
  const systemItems: SlashItem[] = systemSkills.flatMap((skill) =>
    skill.installed &&
    !selectedRepoSkills.some((repo) => repo.title === skill.name)
      ? [
          {
            id: systemSkillTokenId(skill.name),
            label: skill.name,
            description: skill.description,
            badge: "Eva",
          },
        ]
      : [],
  );

  const harnessItems = harnessSlashItems(
    provider,
    [...systemItems, ...repoItems],
    harnessCatalog?.skills,
  );

  return [...systemItems, ...repoItems, ...harnessItems];
}

/**
 * The harness's own built-in skills, shown last. A repo or system skill of
 * the same name shadows the built-in — same precedence the harness applies
 * when a project skill collides with a bundled one.
 *
 * `reported` is the live catalog for this provider; omitted, null or empty
 * falls back to the static list (see `harnessSkillsForProvider`).
 */
export function harnessSlashItems(
  provider: AIProvider | undefined,
  existingItems: ReadonlyArray<Pick<SlashItem, "label">>,
  reported?: readonly HarnessSkill[] | null,
): SlashItem[] {
  const takenLabels = new Set(existingItems.map((item) => item.label));
  const metadata = harnessProviderMetadata(provider);
  if (!metadata) return [];
  return harnessSkillsForProvider(provider, reported).flatMap((skill) =>
    takenLabels.has(skill.name)
      ? []
      : [
          {
            id: harnessSkillTokenId(skill.name),
            label: skill.name,
            description: skill.description,
            // Same badge the `.claude/skills` repo skills carry — a built-in
            // and a Claude-only repo skill are both "provided by Claude" to
            // the person picking one.
            badge: metadata.badge,
            provider,
          },
        ],
  );
}
