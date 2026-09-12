import type { ActivityStep } from "@eva/ui";
import { IconChevronDown, IconFileText } from "@tabler/icons-react";
import { cn, Surface } from "@eva/ui";
import {
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  shouldPreviewChangedFiles,
} from "@/lib/components/chat/changedFilesPresentation";

export interface ChangedFile {
  path: string;
  name: string;
  dir: string;
}

const CHANGED_FILE_TYPES = new Set<ActivityStep["type"]>([
  "edit",
  "write",
  "notebook",
]);

const SANDBOX_REPO_PREFIXES = ["/tmp/repo/", "/workspace/repo/"] as const;

const TMP_REPO_PREFIX = "/tmp/repo/";

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

function displayDir(dir: string): string {
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
export function collectChangedFiles(steps: ActivityStep[]): ChangedFile[] {
  const seen = new Set<string>();
  const files: ChangedFile[] = [];

  for (const step of steps) {
    if (!isChangedFileStep(step)) continue;
    if (seen.has(step.path)) continue;
    seen.add(step.path);
    const dir = dirname(step.path);
    files.push({
      path: step.path,
      name: basename(step.path),
      dir: displayDir(dir),
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
  const visibleFiles = isExpanded
    ? files
    : shouldPreviewChangedFiles(files, isLatestAssistantTurn)
      ? selectChangedFilePreview(files)
      : [];

  const handleViewDiff = () => {
    const firstPath = files[0]?.path;
    onViewDiff?.(firstPath ? toRepoRelativePath(firstPath) : undefined);
  };

  const toggleExpanded = () => onExpandedChange?.(!isExpanded);

  return (
    <Surface density="none" className="mt-2">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={toggleExpanded}
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
      {visibleFiles.length > 0 ? (
        <ul className="grid gap-0.5 px-1.5 pb-1.5">
          {visibleFiles.map((file) => (
            <li key={file.path}>
              {onOpenFile ? (
                <button
                  type="button"
                  onClick={() => onOpenFile(file.path)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <FileRow file={file} />
                </button>
              ) : (
                <div className="flex items-center gap-2 px-1.5 py-1.5">
                  <FileRow file={file} />
                </div>
              )}
            </li>
          ))}
          {!isExpanded && visibleFiles.length < files.length ? (
            <li>
              <button
                type="button"
                onClick={toggleExpanded}
                className="w-full rounded-md px-1.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Show all {files.length} files
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </Surface>
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
