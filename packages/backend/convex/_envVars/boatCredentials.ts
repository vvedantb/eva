import { presentEnv } from "./vercelCredentials";

/** Env var holding a repo's (or team's) Boat API key. Never injected into sandboxes. */
export const BOAT_API_KEY_VAR = "BOAT_API_KEY";

/**
 * Boat key from the target app repo, else the first monorepo sibling that has
 * one (keys are account-wide, unlike Vercel's per-app project id).
 */
export function selectBoatApiKey(
  targetVars: Record<string, string>,
  siblingVarsList: ReadonlyArray<Record<string, string>> = [],
): string | undefined {
  for (const vars of [targetVars, ...siblingVarsList]) {
    const key = presentEnv(vars[BOAT_API_KEY_VAR]);
    if (key) return key;
  }
  return undefined;
}
