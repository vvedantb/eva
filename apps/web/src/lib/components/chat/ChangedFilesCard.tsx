import type { ReactNode } from "react";
import type { ActivityStep } from "@eva/ui";
import { IconChevronDown, IconFileText } from "@tabler/icons-react";
import {
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Surface,
} from "@eva/ui";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  groupChangedFilesByRepo,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  shouldPreviewChangedFiles,
} from "@/lib/components/chat/changedFilesPresentation";

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

const CHANGED_FILE_TYPES = new Set<ActivityStep["type"]>([
  "edit",
  "write",
  "notebook",
]);

const SANDBOX_REPO_PREFIXES = ["/tmp/repo/", "/workspace/repo/"] as const;

const TMP_REPO_PREFIX = "/tmp/repo/";

/** Multi-repo sessions clone linked repos here; see `workspaceLayout.ts`. */
const WORKSPACE_PREFIX = "/tmp/workspace/";

function isChangedFileStep(
  step: ActivityStep,
): step is ActivityStep & { path: string } {
  return (
    CHANGED_FILE_TYPES.has(step.type) &&
    typeof step.path === "string" &&
    step.path.length > 0
  );
}

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

/**
 * Changed-files rows open the Review diffs tab when that handler exists
 * (the card is "what this turn changed"). Activity chips still use
 * `onOpenFile` → Files. Prefer diffs so a row click and View diff land
 * on the same surface.
 */
export function openChangedFile(
  path: string,
  handlers: {
    onViewDiff?: (repoRelativePath?: string) => void;
    onOpenFile?: (path: string) => void;
  },
): void {
  if (handlers.onViewDiff) {
    handlers.onViewDiff(toRepoRelativePath(path));
    return;
  }
  handlers.onOpenFile?.(path);
}

/** Collects edit/write/notebook paths from a turn's activity, including subagent steps. */
export function collectChangedFiles(steps: ActivityStep[]): ChangedFile[] {
  const seen = new Set<string>();
  const files: ChangedFile[] = [];

  for (const step of steps) {
    if (!isChangedFileStep(step)) continue;
    if (seen.has(step.path)) continue;
    seen.add(step.path);
    const dir = dirname(step.path);
    const repoName = workspaceRepoName(step.path);
    files.push({
      path: step.path,
      name: basename(step.path),
      dir: displayDir(dir, repoName),
      repoName,
    });
  }

  return files;
}

interface ChangedFilesCardProps {
  files: ChangedFile[];
  isLatestAssistantTurn: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
}

export function ChangedFilesCard({
  files,
  isLatestAssistantTurn,
  expanded,
  onExpandedChange,
  onOpenFile,
  onViewDiff,
}: ChangedFilesCardProps) {
  if (files.length === 0) return null;

  const isExpanded =
    expanded ?? shouldAutoExpandChangedFiles(files, isLatestAssistantTurn);
  const previewFiles =
    !isExpanded && shouldPreviewChangedFiles(files, isLatestAssistantTurn)
      ? selectChangedFilePreview(files)
      : [];

  const handleViewDiff = () => {
    const firstPath = files[0]?.path;
    onViewDiff?.(firstPath ? toRepoRelativePath(firstPath) : undefined);
  };

  const toggleExpanded = () => onExpandedChange?.(!isExpanded);

  return (
    <Surface density="none" className="mt-2">
      <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={isExpanded}
              className="flex min-w-0 items-center gap-1.5 text-left text-xs font-medium text-foreground"
            >
              <IconChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)]",
                  !isExpanded && "-rotate-90",
                )}
              />
              <span>Changed files ({files.length})</span>
            </button>
          </CollapsibleTrigger>
          {onViewDiff ? (
            <button
              type="button"
              onClick={handleViewDiff}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              View diff
            </button>
          ) : null}
        </div>
        {previewFiles.length > 0 ? (
          <FileList
            files={previewFiles}
            onOpenFile={onOpenFile}
            onViewDiff={onViewDiff}
            className="px-1.5 pb-1.5"
            footer={
              previewFiles.length < files.length ? (
                <li>
                  <button
                    type="button"
                    onClick={toggleExpanded}
                    className="w-full rounded-md px-1.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Show all {files.length} files
                  </button>
                </li>
              ) : null
            }
          />
        ) : null}
        <CollapsibleContent>
          <FileList
            files={files}
            onOpenFile={onOpenFile}
            onViewDiff={onViewDiff}
            className="px-1.5 pb-1.5"
          />
        </CollapsibleContent>
      </Collapsible>
    </Surface>
  );
}

function FileList({
  files,
  onOpenFile,
  onViewDiff,
  className,
  footer,
}: {
  files: ChangedFile[];
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
  className: string;
  footer?: ReactNode;
}) {
  // Multi-repo sessions get a heading per linked repo; a single-repo session
  // has one group and keeps the flat list.
  const groups = groupChangedFilesByRepo(files);
  return (
    <ul className={cn("grid gap-0.5", className)}>
      {groups.length <= 1
        ? files.map((file, index) => (
            <FileListItem
              key={file.path}
              file={file}
              index={index}
              onOpenFile={onOpenFile}
              onViewDiff={onViewDiff}
            />
          ))
        : groups.map((group) => (
            <li key={group.repoName ?? "-"}>
              {group.repoName ? (
                <div className="px-1.5 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 first:pt-0">
                  {group.repoName}/
                </div>
              ) : null}
              <ul className="grid gap-0.5">
                {group.files.map((file, index) => (
                  <FileListItem
                    key={file.path}
                    file={file}
                    index={index}
                    onOpenFile={onOpenFile}
                    onViewDiff={onViewDiff}
                  />
                ))}
              </ul>
            </li>
          ))}
      {footer}
    </ul>
  );
}

function FileListItem({
  file,
  index,
  onOpenFile,
  onViewDiff,
}: {
  file: ChangedFile;
  index: number;
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
}) {
  const clickable = Boolean(onViewDiff || onOpenFile);
  return (
    <ListEnter as="li" index={index} fast slide={false}>
      {clickable ? (
        <button
          type="button"
          onClick={() => openChangedFile(file.path, { onViewDiff, onOpenFile })}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted"
        >
          <FileRow file={file} />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-1.5 py-1.5">
          <FileRow file={file} />
        </div>
      )}
    </ListEnter>
  );
}

function FileRow({ file }: { file: ChangedFile }) {
  return (
    <>
      <IconFileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate font-mono text-xs text-foreground">
        {file.name}
      </span>
      {file.dir ? (
        <span
          className={cn(
            "min-w-0 truncate text-xs text-muted-foreground/70",
            "hidden sm:inline",
          )}
        >
          {file.dir}
        </span>
      ) : null}
    </>
  );
}
