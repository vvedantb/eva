import { MASKED_ENV_VAR_VALUE } from "./listDisplay";

export type EnvVarEntry = {
  key: string;
  value: string;
  sandboxExclude?: boolean;
  /**
   * Given only to snapshot seed runs, never to session sandboxes. Always
   * stored with `sandboxExclude: true`, so every sandbox reader skips it.
   */
  seedOnly?: boolean;
};

/** Inserts or replaces a single key in an env-var document list. */
export function upsertEnvVarEntry(
  vars: EnvVarEntry[],
  entry: EnvVarEntry,
): EnvVarEntry[] {
  const existing = vars.find((candidate) => candidate.key === entry.key);
  const next = vars.filter((candidate) => candidate.key !== entry.key);
  // A value edit keeps a seed-only variable seed-only.
  const keepSeedOnly =
    existing?.seedOnly === true && entry.sandboxExclude === true;
  next.push(keepSeedOnly ? { ...entry, seedOnly: true } : entry);
  return next;
}

/** Drops a key from an env-var document list. */
export function removeEnvVarEntry(
  vars: EnvVarEntry[],
  key: string,
): EnvVarEntry[] {
  return vars.filter((entry) => entry.key !== key);
}

/**
 * Sets the matching key's sandbox scope; other entries are unchanged.
 * `seedOnly` implies `sandboxExclude`.
 */
export function toggleEnvVarSandboxExclude(
  vars: EnvVarEntry[],
  key: string,
  sandboxExclude: boolean,
  seedOnly = false,
): EnvVarEntry[] {
  return vars.map((entry) => {
    if (entry.key !== key) return entry;
    const base = { key: entry.key, value: entry.value };
    return seedOnly
      ? { ...base, sandboxExclude: true, seedOnly: true }
      : { ...base, sandboxExclude };
  });
}

/** Masked list shape shown in the UI. */
export function maskEnvVarEntries(vars: EnvVarEntry[]): Array<{
  key: string;
  value: string;
  sandboxExclude: boolean;
  seedOnly: boolean;
}> {
  return vars.map((entry) => ({
    key: entry.key,
    value: MASKED_ENV_VAR_VALUE,
    sandboxExclude: entry.sandboxExclude ?? false,
    seedOnly: entry.seedOnly ?? false,
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

/** Encrypted seed-only pairs, given to snapshot seed runs only. */
export function seedOnlyEnvVars(
  vars: EnvVarEntry[],
): Array<{ key: string; value: string }> {
  return vars
    .filter((entry) => entry.seedOnly === true)
    .map((entry) => ({ key: entry.key, value: entry.value }));
}
