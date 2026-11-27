"use client";

import { useMemo } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatus, GitStatusEntry } from "@pierre/trees";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { TREE_UNSAFE_CSS, treeThemeVars } from "./treeTheme";

interface DiffFileTreeProps {
  files: string[];
  statuses: Record<string, GitStatus>;
  initialSelectedPath: string | null;
  onSelect: (path: string) => void;
  quiet?: boolean;
}

const TREE_SURFACE_VARS = { "--trees-bg-override": "transparent" };

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
        ...TREE_SURFACE_VARS,
        colorScheme: resolvedTheme,
      }}
      className="h-full w-full"
    />
  );
}
