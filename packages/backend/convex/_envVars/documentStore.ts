import type { GenericDatabaseReader } from "convex/server";
import type { Infer } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel";
import type { envVarEntryValidator } from "../_validators/shapes";

/** Masked bullet string shown for secret env var and credential values in the UI. */
export const MASKED_ENV_VAR_VALUE = "••••••";

/** Loads the single env var document for a repo, or null if none exists. */
export function findRepoEnvVarDoc(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
) {
  return db
    .query("repoEnvVars")
    .withIndex("by_repo", (q) => q.eq("repoId", repoId))
    .first();
}

/** Loads the single env var document for a team, or null if none exists. */
export function findTeamEnvVarDoc(
  db: GenericDatabaseReader<DataModel>,
  teamId: Id<"teams">,
) {
  return db
    .query("teamEnvVars")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .first();
}

/** True when the team (checked first) or the repo env var document has `key`. */
export async function hasTeamOrRepoEnvVarKey(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  teamId: Id<"teams">,
  key: string,
): Promise<boolean> {
  const teamDoc = await findTeamEnvVarDoc(db, teamId);
  if (teamDoc?.vars.some((entry) => entry.key === key)) return true;
  const repoDoc = await findRepoEnvVarDoc(db, repoId);
  return repoDoc?.vars.some((entry) => entry.key === key) ?? false;
}

export type EnvVarEntry = Infer<typeof envVarEntryValidator>;

/** Inserts or replaces a single key in an env-var document list. */
export function upsertEnvVarEntry(
  vars: EnvVarEntry[],
  entry: EnvVarEntry,
): EnvVarEntry[] {
  const next = vars.filter((existing) => existing.key !== entry.key);
  next.push(entry);
  return next;
}

/** Drops a key from an env-var document list. */
export function removeEnvVarEntry(
  vars: EnvVarEntry[],
  key: string,
): EnvVarEntry[] {
  return vars.filter((entry) => entry.key !== key);
}

/** Sets sandboxExclude on the matching key; other entries are unchanged. */
export function toggleEnvVarSandboxExclude(
  vars: EnvVarEntry[],
  key: string,
  sandboxExclude: boolean,
): EnvVarEntry[] {
  return vars.map((entry) =>
    entry.key === key ? { ...entry, sandboxExclude } : entry,
  );
}

/** Masked list shape shown in the UI. */
export function maskEnvVarEntries(vars: EnvVarEntry[]): Array<{
  key: string;
  value: string;
  sandboxExclude: boolean;
}> {
  return vars.map((entry) => ({
    key: entry.key,
    value: MASKED_ENV_VAR_VALUE,
    sandboxExclude: entry.sandboxExclude ?? false,
  }));
}

/** Encrypted pairs eligible for sandbox injection. */
export function sandboxEligibleEnvVars(
  vars: EnvVarEntry[],
): Array<{ key: string; value: string }> {
  return vars
    .filter((entry) => !entry.sandboxExclude)
    .map((entry) => ({ key: entry.key, value: entry.value }));
}
