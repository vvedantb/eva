/** Non-empty env value; whitespace-only is treated as unset. */
export function presentEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export type VercelCredentialSelection =
  | { ok: true; token: string; teamId: string; projectId: string }
  | { ok: false; missing: string[]; message: string };

export function missingVercelCredentialsMessage(missing: string[]): string {
  return (
    `Vercel sandbox credentials missing: ${missing.join(", ")}. ` +
    `VERCEL_PROJECT_ID must be set on this app repo (not borrowed from a sibling).`
  );
}

/**
 * Token and team id may come from monorepo siblings (often team-level).
 * `VERCEL_PROJECT_ID` is target-only so eprocurement never boots under
 * apps/web's Vercel project.
 */
export function selectVercelCredentials(
  targetVars: Record<string, string>,
  siblingVarsList: ReadonlyArray<Record<string, string>> = [],
): VercelCredentialSelection {
  const projectId = presentEnv(targetVars.VERCEL_PROJECT_ID);
  let token = presentEnv(targetVars.VERCEL_TOKEN);
  let teamId = presentEnv(targetVars.VERCEL_TEAM_ID);

  if (!token || !teamId) {
    for (const sibling of siblingVarsList) {
      token = token ?? presentEnv(sibling.VERCEL_TOKEN);
      teamId = teamId ?? presentEnv(sibling.VERCEL_TEAM_ID);
      if (token && teamId) break;
    }
  }

  if (!token || !teamId || !projectId) {
    const missing: string[] = [];
    if (!token) missing.push("VERCEL_TOKEN");
    if (!teamId) missing.push("VERCEL_TEAM_ID");
    if (!projectId) missing.push("VERCEL_PROJECT_ID");
    return {
      ok: false,
      missing,
      message: missingVercelCredentialsMessage(missing),
    };
  }
  return { ok: true, token, teamId, projectId };
}
