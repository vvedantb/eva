"use client";

import { useEffect, useState } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { cn } from "@eva/ui";
import {
  Button,
  RefreshSpinIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import {
  IconFoldDown,
  IconFoldUp,
  IconFolder,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconSearch,
} from "@tabler/icons-react";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import {
  TREE_UNSAFE_CSS,
  treeThemeVars,
} from "@/lib/components/sandbox/treeTheme";

interface SandboxFileTreeProps {
  paths: string[];
  truncated: boolean;
  selectedPath: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectFile: (relPath: string) => void;
  rootLabel?: string;
  /** Which side of the viewer this tree currently sits on. */
  side: "left" | "right";
  /** Moves the tree to the other side of the viewer. */
  onToggleSide: () => void;
}

const TOOLBAR_BUTTON_CLASS =
  "max-sm:hit-target size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

function collectDirectoryPaths(paths: string[]): string[] {
  const directories = new Set<string>();
  for (const path of paths) {
    const segments = path.split("/");
    let prefix = "";
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
  side,
  onToggleSide,
}: SandboxFileTreeProps) {
  const { resolvedTheme } = useThemeMode();
  const [expanded, setExpanded] = useState(false);

  const { model } = useFileTree({
    paths,
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpansion: 1,
    search: true,
    fileTreeSearchMode: "hide-non-matches",
    unsafeCSS: TREE_UNSAFE_CSS,
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    onSelectionChange: (selectedPaths) => {
      const path = selectedPaths[0];
      if (path && !path.endsWith("/")) {
        onSelectFile(path);
      }
    },
  });

  /* eslint-disable no-effect/no-event-handler --
     Drives the tree library imperatively (select + scroll) when `?file=`
     changes, including from a chat chip in another subtree. */
  useEffect(() => {
    if (!selectedPath) return;
    const item = model.getItem(selectedPath);
    if (!item) return;
    if (!item.isSelected()) {
      item.select();
    }
    model.scrollToPath(selectedPath, { offset: "nearest" });
  }, [selectedPath, model]);
  /* eslint-enable no-effect/no-event-handler */

  const setAllExpanded = (next: boolean) => {
    for (const directoryPath of collectDirectoryPaths(paths)) {
      const item = model.getItem(directoryPath);
      if (!item) continue;
      if (!("expand" in item)) continue;
      if (next) {
        item.expand();
      } else {
        item.collapse();
      }
    }
    setExpanded(next);
  };

  const moveSideLabel =
    side === "left"
      ? "Move file list to the right"
      : "Move file list to the left";

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
              shape="rounded"
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
              shape="rounded"
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
        {/* Hidden below `md`: there the tree and the viewer are separate panes
            reached through the switcher, so neither is beside the other and
            "which side" means nothing. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              shape="rounded"
              size="sm"
              variant="ghost"
              className={cn(TOOLBAR_BUTTON_CLASS, "hidden md:inline-flex")}
              onClick={onToggleSide}
              aria-label={moveSideLabel}
            >
              {side === "left" ? (
                <IconLayoutSidebarRight className="size-3.5" />
              ) : (
                <IconLayoutSidebar className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">{moveSideLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              shape="rounded"
              size="sm"
              variant="ghost"
              className={TOOLBAR_BUTTON_CLASS}
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh file list"
            >
              <RefreshSpinIcon busy={isRefreshing} className="size-3.5" />
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
