import { MASKED_ENV_VAR_VALUE } from "./listDisplay";

export type EnvVarEntry = {
  key: string;
  value: string;
  sandboxExclude?: boolean;
};

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
