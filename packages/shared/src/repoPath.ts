import type { ChatEntityKind } from "@eva/backend";

type RepoPathFields = { owner: string; name: string; rootDirectory?: string };

/** Web path prefix for a githubRepos row (a monorepo app adds its folder name: `/owner/name/app`). */
export function repoBasePath(repo: RepoPathFields): string {
  if (!repo.rootDirectory) return `/${repo.owner}/${repo.name}`;
  const appName = repo.rootDirectory.split("/").pop();
  if (!appName) return `/${repo.owner}/${repo.name}`;
  return `/${repo.owner}/${repo.name}/${appName}`;
}

/** Repo section that lists each chat kind: `/owner/name/<section>/<numId>`. */
export const ENTITY_SECTION = {
  session: "sessions",
  task: "quick-tasks",
  project: "projects",
} as const satisfies Record<ChatEntityKind, string>;

/**
 * Web path of one session, quick task or project, keyed by its per-repo numId.
 * Without a numId (still awaiting backfill) it is the kind's section list.
 */
export function entityHref(
  kind: ChatEntityKind,
  repo: RepoPathFields,
  numId: number | undefined,
): string {
  const section = `${repoBasePath(repo)}/${ENTITY_SECTION[kind]}`;
  return numId === undefined ? section : `${section}/${numId}`;
}
