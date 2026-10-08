import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { githubRepoFields } from "../validators";
import { hasRepoAccess } from "../functions";
import { pickSandboxRepoId } from "./sandboxRepoPick";

export {
  pickDefaultVisibleAppRepo,
  pickSandboxRepoId,
  pickSnapshotCredentialRepoId,
  type AppRepoPickFields,
} from "./sandboxRepoPick";

/** True when the user connected the repo or shares its team. */
export async function userCanAccessRepo(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  repo: Doc<"githubRepos">,
): Promise<boolean> {
  if (repo.connectedBy === userId) return true;
  const teamId = repo.teamId;
  if (!teamId) return false;
  const membership = await db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .first();
  return membership !== null;
}

/** Resolves a repo ID to its parent repo ID if it is a sub-app, otherwise returns itself. */
export async function resolveCanonicalRepoId(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Id<"githubRepos">> {
  const repo = await db.get(repoId);
  if (!repo) return repoId;
  if (repo.parentRepoId) {
    const parent = await db.get(repo.parentRepoId);
    if (parent) return parent._id;
  }
  return repoId;
}

/** Stable repo id for codebase-wide docs (PR recaps). Prefers root row, else first connected sibling. */
export async function resolveCodebaseDocsRepoId(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Id<"githubRepos">> {
  const siblings = await findSiblingRepos(db, repoId);
  if (siblings.length === 0) return repoId;

  const root = siblings.find((repo) => repo.rootDirectory === undefined);
  if (root) return root._id;

  const connected = siblings.find((repo) => repo.connectedBy !== undefined);
  if (connected) return connected._id;

  return repoId;
}

/** True when the user can access any repo row for the same GitHub owner/name codebase. */
export async function hasCodebaseRepoAccess(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
): Promise<boolean> {
  const siblingIds = await findAllSiblingRepoIds(db, repoId);
  for (const siblingId of siblingIds) {
    if (await hasRepoAccess(db, siblingId, userId)) return true;
  }
  return false;
}

/** Finds all repo rows sharing the same GitHub owner and name (root + sub-apps). */
export async function findSiblingRepos(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Array<Doc<"githubRepos">>> {
  const repo = await db.get(repoId);
  if (!repo) return [];

  return await db
    .query("githubRepos")
    .withIndex("by_owner_and_name", (q) =>
      q.eq("owner", repo.owner).eq("name", repo.name),
    )
    .collect();
}

/** Finds all repo entry ids sharing the same owner and name (root + sub-apps). */
export async function findAllSiblingRepoIds(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Array<Id<"githubRepos">>> {
  const siblings = await findSiblingRepos(db, repoId);
  if (siblings.length === 0) return [repoId];
  return siblings.map((s) => s._id);
}

/**
 * All repos the user can access (connected + team), de-duplicated.
 * Shared by list queries and cross-repo spotlight search.
 */
export async function gatherAccessibleRepos(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  includeHidden: boolean,
): Promise<Array<Doc<"githubRepos">>> {
  const userTeamMemberships = await db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const teamRepoResults = await Promise.all(
    userTeamMemberships.map((m) =>
      db
        .query("githubRepos")
        .withIndex("by_team", (q) => q.eq("teamId", m.teamId))
        .collect(),
    ),
  );

  const connectedRepos = await db
    .query("githubRepos")
    .withIndex("by_connected_by", (q) => q.eq("connectedBy", userId))
    .collect();

  const seen = new Set<string>();
  const repos: Array<Doc<"githubRepos">> = [];
  for (const repo of [...connectedRepos, ...teamRepoResults.flat()]) {
    if (seen.has(String(repo._id))) continue;
    seen.add(String(repo._id));
    if (!includeHidden && repo.hidden === true) continue;
    repos.push(repo);
  }
  return repos;
}

/** Frontend path prefix for a githubRepos row (monorepo apps use `name/app`). */
export function repoBasePath(repo: {
  owner: string;
  name: string;
  rootDirectory?: string;
}): string {
  if (!repo.rootDirectory) return `/${repo.owner}/${repo.name}`;
  const appName = repo.rootDirectory.split("/").pop();
  if (!appName) return `/${repo.owner}/${repo.name}`;
  return `/${repo.owner}/${repo.name}/${appName}`;
}

/** Custom label when set; otherwise leaf folder or GitHub name. */
export function repoDisplayLabel(repo: {
  label?: string;
  name: string;
  rootDirectory?: string;
}): string {
  const custom = repo.label?.trim();
  if (custom) return custom;
  if (repo.rootDirectory) {
    const leaf = repo.rootDirectory.split("/").pop();
    if (leaf) return leaf;
  }
  return repo.name;
}

/**
 * Picks which githubRepos row to use for sandbox credentials.
 * Shared automations and PR recaps often run against the monorepo root, which
 * has no VERCEL_PROJECT_ID — credentials live on app rows.
 */
export async function resolveSandboxRepoId(
  db: GenericDatabaseReader<DataModel>,
  workflowRepoId: Id<"githubRepos">,
  siblings?: Array<Doc<"githubRepos">>,
): Promise<Id<"githubRepos">> {
  const siblingRepos = siblings ?? (await findSiblingRepos(db, workflowRepoId));
  return pickSandboxRepoId(workflowRepoId, siblingRepos, async (repoId) => {
    const envDoc = await db
      .query("repoEnvVars")
      .withIndex("by_repo", (q) => q.eq("repoId", repoId))
      .first();
    return (
      envDoc?.vars.some((entry) => entry.key === "VERCEL_PROJECT_ID") === true
    );
  });
}

/** Validator for the full githubRepos document shape including system fields. */
export const githubRepoValidator = v.object({
  _id: v.id("githubRepos"),
  _creationTime: v.number(),
  ...githubRepoFields,
});

/**
 * Repo document plus a resolved `logoUrl` (from `logoStorageId`) for the list
 * views that render the logo. Only `list`/`listByTeam` pay the storage lookup;
 * the plain `githubRepoValidator` stays cheap for every other query.
 */
export const githubRepoWithLogoValidator = v.object({
  _id: v.id("githubRepos"),
  _creationTime: v.number(),
  ...githubRepoFields,
  logoUrl: v.optional(v.union(v.string(), v.null())),
});
