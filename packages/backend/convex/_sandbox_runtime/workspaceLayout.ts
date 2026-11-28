/** Parent directory holding one entry per repo in a session's sandbox. */
export const WORKSPACE_ROOT = "/tmp/workspace";

/**
 * The primary repo's checkout. Unchanged by multi-repo sessions — the workspace
 * only gains a symlink pointing here. Mirrors the `WORKSPACE_DIR` constants in
 * the node-only sandbox modules, which queries and workflows cannot import.
 */
export const PRIMARY_REPO_DIR = "/tmp/repo";

/** Clone path of a linked repo, named after its GitHub repository name. */
export function linkedRepoDir(name: string): string {
  return `${WORKSPACE_ROOT}/${name}`;
}

/**
 * Workspace path of the primary repo. Same shape as `linkedRepoDir`, but the
 * entry is a symlink to `/tmp/repo` rather than a clone of its own.
 */
export function primaryLinkPath(name: string): string {
  return `${WORKSPACE_ROOT}/${name}`;
}

/**
 * The repo name a workspace path belongs to, or null when the path is not under
 * the workspace root. Accepts both the repo directory itself and any path
 * inside it, so tool output can be attributed back to a repo.
 */
export function repoNameFromWorkspacePath(path: string): string | null {
  const prefix = `${WORKSPACE_ROOT}/`;
  if (!path.startsWith(prefix)) return null;
  const name = path.slice(prefix.length).split("/")[0];
  return name ? name : null;
}
