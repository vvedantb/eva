/** True when the repo row is a monorepo sub-app (has a root directory). */
export function isAppRepo(repo: { rootDirectory?: string }): boolean {
  return repo.rootDirectory !== undefined;
}

/** True when the GitHub codebase has multiple apps or this row is part of one. */
export function isMonorepoCodebase(
  repo: { parentRepoId?: string | undefined },
  siblingAppCount: number,
): boolean {
  return repo.parentRepoId !== undefined || siblingAppCount > 0;
}

/** Normalizes a domain or URL input to a hostname for repo domain matching. */
export function extractHostname(raw: string): string {
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname;
  } catch {
    return raw;
  }
}

/** Formats bytes into human-readable size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
