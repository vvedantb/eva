"use client";

import { useMemo } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatus, GitStatusEntry } from "@pierre/trees";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { treeThemeVars } from "./treeTheme";

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
  /** Row height and type scale; the Code tab reads at `relaxed`. */
  density?: "compact" | "default" | "relaxed";
}

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
  density = "default",
}: DiffFileTreeProps) {
  const { resolvedTheme } = useThemeMode();

  const gitStatus = useMemo<GitStatusEntry[]>(
    () => files.map((path) => ({ path, status: statuses[path] ?? "modified" })),
    [files, statuses],
  );

  const { model } = useFileTree({
    paths: files,
    gitStatus,
    density,
    flattenEmptyDirectories: true,
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
      style={{ ...treeThemeVars, colorScheme: resolvedTheme }}
      className="h-full w-full"
    />
  );
}
