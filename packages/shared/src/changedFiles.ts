/**
 * The files an agent turn changed, read from its activity steps, and how the
 * chat's "Changed files" card lists them. Pure, so the web card and the phone
 * card read one list.
 */

export interface ChangedFile {
  path: string;
  name: string;
  dir: string;
  /**
   * The linked repo this file belongs to (multi-repo sessions), or `null` for
   * the primary repo. Derived from the `/tmp/workspace/<name>/…` sandbox
   * prefix — see `workspaceRepoName`.
   */
  repoName: string | null;
}

/** The step fields `collectChangedFiles` reads: the web `ActivityStep` subset. */
export interface ChangedFileStep {
  type: string;
  path?: string;
}

const CHANGED_FILE_TYPES = new Set(["edit", "write", "notebook"]);

const SANDBOX_REPO_PREFIXES = ["/tmp/repo/", "/workspace/repo/"] as const;

const TMP_REPO_PREFIX = "/tmp/repo/";

/** Multi-repo sessions clone linked repos here; see `workspaceLayout.ts`. */
const WORKSPACE_PREFIX = "/tmp/workspace/";

const CHANGED_FILES_AUTO_EXPAND_LIMIT = 5;
const CHANGED_FILES_PREVIEW_LIMIT = 3;

function basename(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
}

function dirname(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex >= 0 ? path.slice(0, slashIndex) : "";
}

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

function displayDir(dir: string, repoName: string | null): string {
  if (repoName) {
    const prefix = `${WORKSPACE_PREFIX}${repoName}/`;
    return dir.startsWith(prefix) ? dir.slice(prefix.length) : dir;
  }
  if (dir.startsWith(TMP_REPO_PREFIX)) {
    return dir.slice(TMP_REPO_PREFIX.length);
  }
  return dir;
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

/** Collects edit/write/notebook paths from a turn's activity, including subagent steps. */
export function collectChangedFiles(
  steps: ReadonlyArray<ChangedFileStep>,
): ChangedFile[] {
  const seen = new Set<string>();
  const files: ChangedFile[] = [];

  for (const step of steps) {
    const path = step.path;
    if (!CHANGED_FILE_TYPES.has(step.type) || !path) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const repoName = workspaceRepoName(path);
    files.push({
      path,
      name: basename(path),
      dir: displayDir(dirname(path), repoName),
      repoName,
    });
  }

  return files;
}

function topLevelScope(path: string): string {
  const normalized = path
    .replace(/^\/tmp\/repo\//, "")
    .replace(/^\/workspace\/repo\//, "")
    .replaceAll("\\", "/");
  return normalized.split("/").find((segment) => segment.length > 0) ?? "";
}

export function shouldAutoExpandChangedFiles(
  files: ReadonlyArray<ChangedFile>,
  isLatestAssistantTurn: boolean,
): boolean {
  return (
    isLatestAssistantTurn && files.length <= CHANGED_FILES_AUTO_EXPAND_LIMIT
  );
}

export function shouldPreviewChangedFiles(
  files: ReadonlyArray<ChangedFile>,
  isLatestAssistantTurn: boolean,
): boolean {
  return (
    isLatestAssistantTurn && files.length > CHANGED_FILES_AUTO_EXPAND_LIMIT
  );
}

export interface ChangedFileGroup {
  /** `null` is the primary repo — rendered without a heading. */
  repoName: string | null;
  files: ChangedFile[];
}

/**
 * Groups an already-selected file list by linked repo (multi-repo sessions),
 * preserving each file's relative order within its group and ordering groups
 * by first appearance. The primary repo (`repoName: null`) renders with
 * today's flat presentation — no heading — so a single-repo session's card is
 * unchanged.
 */
export function groupChangedFilesByRepo(
  files: ReadonlyArray<ChangedFile>,
): ChangedFileGroup[] {
  const groups: ChangedFileGroup[] = [];
  const byRepoName = new Map<string | null, ChangedFileGroup>();

  for (const file of files) {
    let group = byRepoName.get(file.repoName);
    if (!group) {
      group = { repoName: file.repoName, files: [] };
      byRepoName.set(file.repoName, group);
      groups.push(group);
    }
    group.files.push(file);
  }

  return groups;
}

export function selectChangedFilePreview(
  files: ReadonlyArray<ChangedFile>,
  limit = CHANGED_FILES_PREVIEW_LIMIT,
): ChangedFile[] {
  const selected: ChangedFile[] = [];
  const selectedPaths = new Set<string>();
  const selectedScopes = new Set<string>();

  for (const file of files) {
    const scope = topLevelScope(file.path);
    if (selectedScopes.has(scope)) continue;
    selected.push(file);
    selectedPaths.add(file.path);
    selectedScopes.add(scope);
    if (selected.length === limit) return selected;
  }

  for (const file of files) {
    if (selectedPaths.has(file.path)) continue;
    selected.push(file);
    if (selected.length === limit) break;
  }

  return selected;
}
