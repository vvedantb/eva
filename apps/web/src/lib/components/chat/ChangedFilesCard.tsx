import type { ReactNode } from "react";
import { cn } from "@eva/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Surface,
  ListEnter,
} from "@vvedantb/ui";
import { IconChevronDown, IconFileText } from "@tabler/icons-react";
import {
  groupChangedFilesByRepo,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  shouldPreviewChangedFiles,
  toRepoRelativePath,
  type ChangedFile,
} from "@eva/shared";

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
                <div className="px-1.5 pb-0.5 pt-1.5 text-3xs font-medium uppercase tracking-wide text-muted-foreground/70 first:pt-0">
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
