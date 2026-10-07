/**
 * Serialises a linked repo's resolved env vars into a shell-sourceable
 * `.env.eva` file written at that repo's own clone root — never mixed into the
 * sandbox-wide env file, since a linked repo's vars belong only to its own dev
 * server (see `linkedRepos.ts`'s `prepareLinkedRepo`).
 *
 * Pure and dependency-free (no `"use node"`) so it can be unit tested without
 * the node runtime, matching `workspaceLayout.ts` and `divergedPublish.ts`.
 */

/** Escapes a value for embedding inside single quotes: `'` becomes `'\''`. */
function shellSingleQuoteEscape(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

/**
 * Formats env vars as `KEY='value'` lines, one per entry, safe to `source` in
 * bash. Returns an empty string when there are no vars — callers should skip
 * writing the file entirely in that case rather than write an empty one.
 */
export function formatEnvFile(vars: Record<string, string>): string {
  const keys = Object.keys(vars);
  if (keys.length === 0) return "";
  return (
    keys
      .map((key) => `${key}='${shellSingleQuoteEscape(vars[key] ?? "")}'`)
      .join("\n") + "\n"
  );
}
