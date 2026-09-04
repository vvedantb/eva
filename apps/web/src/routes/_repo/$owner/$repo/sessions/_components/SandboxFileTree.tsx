"use client";

import { useEffect, useState } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from "@eva/ui";
import {
  IconFoldDown,
  IconFoldUp,
  IconFolder,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { treeThemeVars } from "@/lib/components/sandbox/treeTheme";

interface SandboxFileTreeProps {
  paths: string[];
  truncated: boolean;
  selectedPath: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectFile: (relPath: string) => void;
  /** Repo root folder name shown in the toolbar; falls back to "Files". */
  rootLabel?: string;
}

/** Shared so the three toolbar icon buttons cannot drift apart. */
const TOOLBAR_BUTTON_CLASS =
  "max-sm:hit-target size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

/**
 * Every ancestor directory of `paths` as canonical Pierre directory IDs
 * (trailing `/`). `@pierre/trees` exposes no bulk expand/collapse, and the
 * model can only enumerate *visible* rows, so the toolbar toggle derives the
 * full directory set from the file list instead.
 */
function collectDirectoryPaths(paths: string[]): string[] {
  const directories = new Set<string>();
  for (const path of paths) {
    const segments = path.split("/");
    let prefix = "";
    // The last segment is the file itself, so stop one short.
    for (const segment of segments.slice(0, -1)) {
      prefix += `${segment}/`;
      directories.add(prefix);
    }
  }
  return [...directories];
}

/**
 * Full-repo file tree for the session Files tab. Unlike DiffFileTree (diff-
 * specialised: gitStatus, always expanded), this is search-first with shallow
 * initial expansion. The model is created once by `useFileTree`; the parent
 * remounts via `key` when the file list content changes.
 */
export function SandboxFileTree({
  paths,
  truncated,
  selectedPath,
  isRefreshing,
  onRefresh,
  onSelectFile,
  rootLabel,
}: SandboxFileTreeProps) {
  const { resolvedTheme } = useThemeMode();
  // Mirrors the toggle's own actions only: `initialExpansion: 1` means the
  // tree starts shallow, so "expand all" is the first available action.
  const [expanded, setExpanded] = useState(false);

  const { model } = useFileTree({
    paths,
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpansion: 1,
    search: true,
    fileTreeSearchMode: "hide-non-matches",
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    onSelectionChange: (selectedPaths) => {
      const path = selectedPaths[0];
      // Pierre directory IDs always end with `/`; list is files-only.
      if (path && !path.endsWith("/")) {
        onSelectFile(path);
      }
    },
  });

  // Keep highlight + scroll in sync when `?file=` changes while mounted
  // (chat chip). Re-setting the same path is a nuqs no-op — no loop.
  useEffect(() => {
    if (!selectedPath) return;
    const item = model.getItem(selectedPath);
    if (!item) return;
    if (!item.isSelected()) {
      item.select();
    }
    model.scrollToPath(selectedPath, { offset: "nearest" });
  }, [selectedPath, model]);

  const setAllExpanded = (next: boolean) => {
    for (const directoryPath of collectDirectoryPaths(paths)) {
      const item = model.getItem(directoryPath);
      if (!item) continue;
      // `in` narrows the handle union — only directory handles can expand.
      // Flattened directory chains have no own handle and are skipped above.
      if (!("expand" in item)) continue;
      if (next) {
        item.expand();
      } else {
        item.collapse();
      }
    }
    setExpanded(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* h-10 matches the viewer pane header so the two line up. The hairline
          is a list/detail region divider, not decoration. */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs">
          <IconFolder className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            <span className="font-medium text-foreground">
              {rootLabel ?? "Files"}
            </span>
            <span className="text-muted-foreground">
              {" · "}
              {paths.length.toLocaleString()} files
            </span>
            {truncated ? (
              <span
                className="text-muted-foreground/80"
                title="File list capped at 20,000 entries"
              >
                {" · partial"}
              </span>
            ) : null}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={TOOLBAR_BUTTON_CLASS}
              onClick={() => {
                model.openSearch();
              }}
              aria-label="Search files"
            >
              <IconSearch className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Search files</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={TOOLBAR_BUTTON_CLASS}
              onClick={() => {
                setAllExpanded(!expanded);
              }}
              aria-label={expanded ? "Collapse all" : "Expand all"}
            >
              {expanded ? (
                <IconFoldUp className="size-3.5" />
              ) : (
                <IconFoldDown className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            {expanded ? "Collapse all" : "Expand all"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={TOOLBAR_BUTTON_CLASS}
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh file list"
            >
              <IconRefresh
                className={cn("size-3.5", isRefreshing && "animate-spin")}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Refresh</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1">
        <FileTree
          model={model}
          style={{ ...treeThemeVars, colorScheme: resolvedTheme }}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
