"use client";

import { useMemo } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatus, GitStatusEntry } from "@pierre/trees";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { TREE_UNSAFE_CSS, treeThemeVars } from "./treeTheme";

interface DiffFileTreeProps {
  /** Changed file paths, in diff order. */
  files: string[];
  /** Per-path git status, drives the tree's colour indicators. */
  statuses: Record<string, GitStatus>;
  /** Path highlighted on first render (restored from the URL). */
  initialSelectedPath: string | null;
  /**
   * Fired when a file row is clicked. Only leaf files reach here — directory
   * selections are filtered out because they are not in `files`.
   */
  onSelect: (path: string) => void;
  /**
   * Cursor's plain list: no git-status colours, letters or folder dots, no
   * indent guides, a lighter selection. The cards beside it already carry the
   * change counts.
   */
  quiet?: boolean;
}

const QUIET_TREE_VARS = {
  "--trees-indent-guide-bg-override": "transparent",
  "--trees-git-lane-width-override": "0px",
  "--trees-font-size-override": "14px",
};

/**
 * Left-hand file tree for the Diffs tab. Renders the changed files as a
 * clickable, nested tree with git-status colours. The model is created once by
 * `useFileTree`, so `DiffsPanel` remounts this component (via `key`) when the
 * set of changed files changes.
 */
export function DiffFileTree({
  files,
  statuses,
  initialSelectedPath,
  onSelect,
  quiet = false,
}: DiffFileTreeProps) {
  const { resolvedTheme } = useThemeMode();

  const gitStatus = useMemo<GitStatusEntry[]>(
    () => files.map((path) => ({ path, status: statuses[path] ?? "modified" })),
    [files, statuses],
  );

  const { model } = useFileTree({
    paths: files,
    ...(quiet ? {} : { gitStatus }),
    flattenEmptyDirectories: true,
    unsafeCSS: TREE_UNSAFE_CSS,
    initialExpansion: "open",
    initialSelectedPaths: initialSelectedPath ? [initialSelectedPath] : [],
    // Fires for file and directory rows; ignore paths outside the changed set
    // (i.e. directories) so only real file clicks drive the diff view.
    onSelectionChange: (selectedPaths) => {
      const path = selectedPaths[0];
      if (path && files.includes(path)) onSelect(path);
    },
  });

  return (
    <FileTree
      model={model}
      style={{
        ...treeThemeVars,
        ...(quiet ? QUIET_TREE_VARS : {}),
        colorScheme: resolvedTheme,
      }}
      className="h-full w-full"
    />
  );
}
