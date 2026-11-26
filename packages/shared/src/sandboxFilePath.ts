/**
 * Sandbox file paths: the primary checkout (`/tmp/repo`), linked repos under
 * the multi-repo workspace (`/tmp/workspace/<name>`), and repo-relative git
 * paths. Pure, so web and phone read one rule.
 */

const SANDBOX_REPO_PREFIXES = ["/tmp/repo/", "/workspace/repo/"] as const;

/** Multi-repo sessions clone linked repos here; see `workspaceLayout.ts`. */
const WORKSPACE_PREFIX = "/tmp/workspace/";

/**
 * Repo name a path belongs to when it sits under the multi-repo workspace
 * root (`/tmp/workspace/<name>/…`), or `null` for the primary repo
 * (`/tmp/repo/…`, or legacy `/workspace/repo/…`).
 */
export function workspaceRepoName(path: string): string | null {
  if (!path.startsWith(WORKSPACE_PREFIX)) return null;
  const rest = path.slice(WORKSPACE_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return rest.slice(0, slash);
}

/**
 * Checkout root a sandbox path belongs to when it is a linked repo
 * (`/tmp/workspace/<name>` — the same value as `sessionRepos.path`), or `null`
 * for the primary repo. Lets a file opened from the chat select the right root
 * in the Files tab instead of listing the primary beside another repo's file.
 */
export function workspaceRootPath(path: string): string | null {
  const repoName = workspaceRepoName(path);
  return repoName === null ? null : `${WORKSPACE_PREFIX}${repoName}`;
}

/** Strips sandbox absolute prefixes so Diffs tab paths align with git diff keys. */
export function toRepoRelativePath(path: string): string {
  for (const prefix of SANDBOX_REPO_PREFIXES) {
    if (path.startsWith(prefix)) {
      return path.slice(prefix.length);
    }
  }
  return path;
}

/**
 * Inverse of `toRepoRelativePath` for Diffs → Files. Repo-relative git paths
 * become the absolute `?file=` the viewer reads; already-absolute paths pass
 * through. `/tmp/repo` is the Eva sandbox root and the prefix Files already
 * understands when the live listing root has not loaded yet.
 */
export function toSandboxFilePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return `${SANDBOX_REPO_PREFIXES[0]}${trimmed}`;
}
