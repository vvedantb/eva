import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { userCanAccessRepo } from "../functions";
import { gatherAccessibleRepos } from "./helpers";

/**
 * A GitHub repository a sandbox may mint a read-only token for: the owner/name
 * git asked about plus the installation (and repository id) the token is scoped
 * to. One entry per GitHub repository, not per eva app row.
 */
export type ReadableSiblingRepo = {
  owner: string;
  name: string;
  installationId: number;
  githubId: number | undefined;
};

/** Case-insensitive owner/name key: GitHub treats `Org/Repo` and `org/repo` as one repository. */
function repoKey(repo: { owner: string; name: string }): string {
  return `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
}

/** True when two owner/name pairs name the same GitHub repository. */
export function isSameGitHubRepo(
  a: { owner: string; name: string },
  b: { owner: string; name: string },
): boolean {
  return repoKey(a) === repoKey(b);
}

/**
 * Every `githubRepos` row for the same owner/name as the given rows, including
 * rows the user cannot access. The opt-out flag is shared across sibling app
 * rows, so the exclusion check must see the whole group to stay fail-closed.
 */
async function collectGroupRows(
  db: GenericDatabaseReader<DataModel>,
  rows: Array<Doc<"githubRepos">>,
): Promise<Array<Doc<"githubRepos">>> {
  const byId = new Map<string, Doc<"githubRepos">>();
  const queriedPairs = new Set<string>();
  for (const row of rows) {
    byId.set(String(row._id), row);
  }
  for (const row of rows) {
    const pair = `${row.owner}/${row.name}`;
    if (queriedPairs.has(pair)) continue;
    queriedPairs.add(pair);
    const siblings = await db
      .query("githubRepos")
      .withIndex("by_owner_and_name", (q) =>
        q.eq("owner", row.owner).eq("name", row.name),
      )
      .collect();
    for (const sibling of siblings) {
      byId.set(String(sibling._id), sibling);
    }
  }
  return [...byId.values()];
}

/**
 * Sibling GitHub repositories (deduped by owner/name, case-insensitive) that
 * `userId` may read from a sandbox whose home repo is `homeRepoId`.
 *
 * Excludes the home repository itself (same owner/name), rows with
 * `hidden === true`, rows with `connected === false`, and any repository whose
 * sibling group carries the `sandboxReadExcluded` opt-out. A hidden or
 * disconnected row does not by itself exclude a repository that still has a
 * usable sibling row. Sorted by `owner/name`.
 */
export async function listReadableSiblingRepos(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  homeRepoId: Id<"githubRepos">,
): Promise<ReadableSiblingRepo[]> {
  const homeRepo = await db.get(homeRepoId);
  const candidates = await gatherAccessibleRepos(db, userId, true);

  const groups = new Map<string, Array<Doc<"githubRepos">>>();
  for (const repo of candidates) {
    if (!(await userCanAccessRepo(db, repo, userId))) continue;
    if (homeRepo && isSameGitHubRepo(repo, homeRepo)) continue;
    const key = repoKey(repo);
    const existing = groups.get(key);
    if (existing) existing.push(repo);
    else groups.set(key, [repo]);
  }

  const readable: ReadableSiblingRepo[] = [];
  for (const accessibleRows of groups.values()) {
    const groupRows = await collectGroupRows(db, accessibleRows);
    if (groupRows.some((row) => row.sandboxReadExcluded === true)) continue;
    const representative = accessibleRows.find(
      (row) => row.hidden !== true && row.connected !== false,
    );
    if (!representative) continue;
    readable.push({
      owner: representative.owner,
      name: representative.name,
      installationId: representative.installationId,
      githubId: representative.githubId,
    });
  }

  return readable.sort((a, b) => repoKey(a).localeCompare(repoKey(b)));
}

/**
 * Resolves one requested repository for a sandbox credential request.
 * Returns null when the repository is unknown, opted out, or out of reach.
 */
export async function resolveSiblingReadAccess(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  homeRepoId: Id<"githubRepos">,
  owner: string,
  name: string,
): Promise<ReadableSiblingRepo | null> {
  const readable = await listReadableSiblingRepos(db, userId, homeRepoId);
  return (
    readable.find((repo) => isSameGitHubRepo(repo, { owner, name })) ?? null
  );
}
