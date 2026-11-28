/** Owner and repository name taken from a git credential `path=` component. */
export type RepoPath = { owner: string; name: string };

/** The installations a sandbox may mint tokens for. */
export type CredentialInstallations = {
  installationId: number;
  installationIds?: number[];
};

/**
 * Parses git's `path=` component (e.g. `owner/name.git`, or `/owner/name` from
 * some remotes) into owner and repository name. Returns null when the path does
 * not name a repository.
 */
export function parseRepoPath(path: string): RepoPath | null {
  const segments = path
    .trim()
    .replace(/\.git$/i, "")
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length < 2) return null;
  const [owner, name] = segments;
  return { owner, name };
}

/**
 * The installation ids a sandbox is allowed to mint tokens for. Rows written
 * before multi-repo sessions carry only the primary `installationId`.
 */
export function allowedInstallationIds(
  credential: CredentialInstallations,
): number[] {
  const ids = credential.installationIds;
  return ids && ids.length > 0 ? ids : [credential.installationId];
}

/** Whether a repo's installation is one this sandbox may mint a token for. */
export function isInstallationAllowed(
  installationId: number,
  credential: CredentialInstallations,
): boolean {
  return allowedInstallationIds(credential).includes(installationId);
}
