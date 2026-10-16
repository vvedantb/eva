"use client";

import { IconFile } from "@tabler/icons-react";

import { cn } from "../utils/cn";

function FileChipLabel({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground",
        className,
      )}
    >
      <IconFile className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * A file name in an activity line or step body. Opens the file viewer when the
 * full path and an `onOpenFile` handler are both known; plain text otherwise.
 */
export function FileChip({
  name,
  path,
  onOpenFile,
}: {
  name: string;
  path?: string;
  onOpenFile?: (path: string) => void;
}) {
  if (!path || !onOpenFile) return <FileChipLabel name={name} />;
  return (
    <button
      type="button"
      title={path}
      onClick={(event) => {
        event.stopPropagation();
        onOpenFile(path);
      }}
      className="inline-flex min-w-0 max-w-full cursor-pointer"
    >
      <FileChipLabel name={name} className="transition-colors hover:bg-muted" />
    </button>
  );
}
