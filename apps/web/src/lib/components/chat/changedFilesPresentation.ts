import type { ChangedFile } from "@/lib/components/chat/ChangedFilesCard";

const CHANGED_FILES_AUTO_EXPAND_LIMIT = 5;
const CHANGED_FILES_PREVIEW_LIMIT = 3;

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
