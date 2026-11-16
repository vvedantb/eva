/** True when the repo row is a monorepo sub-app (has a root directory). */
export function isAppRepo(repo: { rootDirectory?: string }): boolean {
  return repo.rootDirectory !== undefined;
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
