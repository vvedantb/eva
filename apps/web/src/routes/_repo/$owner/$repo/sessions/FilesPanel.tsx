"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { useLocalStorage } from "usehooks-ts";
import type { Id } from "@eva/backend";
import { Button, Spinner, cn } from "@eva/ui";
import { IconRefresh } from "@tabler/icons-react";
import { toRepoRelativePath } from "@/lib/components/chat/ChangedFilesCard";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { ResizableSidebar } from "@/lib/components/ResizableSidebar";
import type { SandboxFileListApi } from "@/lib/components/sandbox/useSandboxFileList";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { repoTileColor } from "@/lib/utils/repoTileColor";
import { fileViewerPathParser } from "@/lib/search-params";
import { FileViewerPanel } from "./FileViewerPanel";
import { SandboxFileTree } from "./_components/SandboxFileTree";
<<<<<<< HEAD
import type { SessionRepoListItem } from "./_utils";
=======
import { ViewerNotice } from "./_components/ViewerNotice";
import { fileTreeSideFromStorage } from "./_utils/-fileTreeSide";
>>>>>>> origin/main

interface FilesPanelProps {
  sandboxId: string | undefined;
  repoId: Id<"githubRepos">;
  isActive: boolean;
  fileList: SandboxFileListApi;
  /**
   * The session's checked-out repos (primary + linked). Omitted by task and
   * project sandboxes, which never have linked repos — the root selector only
   * renders when there is more than one row.
   */
  repos?: SessionRepoListItem[];
  /** Currently selected root path ("" = primary); see `filesRootParser`. */
  activeRoot?: string;
  onRootChange?: (root: string | null) => void;
}

/** Root selector shown above the tree once a session has linked repos. */
function FilesRootSelector({
  repos,
  activeRoot,
  onSelect,
}: {
  repos: SessionRepoListItem[];
  activeRoot: string;
  onSelect: (root: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
      {repos.map((repo) => {
        // The primary's own root path is stored as "" in the URL so a
        // single-repo session never needs the param at all.
        const rootValue = repo.kind === "primary" ? "" : repo.path;
        const label = repoDisplayLabel(repo);
        const active = activeRoot === rootValue;
        return (
          <button
            key={repo.repoId}
            type="button"
            onClick={() => onSelect(rootValue)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <RepoLogo
              logoUrl={repo.logoUrl}
              size={14}
              fallback={
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold text-white",
                    repoTileColor(`${repo.owner}/${repo.name}/${label}`),
                  )}
                >
                  {label.charAt(0).toUpperCase()}
                </span>
              }
            />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function deriveSelectedRelPath(
  file: string,
  root: string | null,
): string | null {
  if (!file || !root) return null;
  const prefix = `${root}/`;
  if (file.startsWith(prefix)) return file.slice(prefix.length);
  const relative = toRepoRelativePath(file);
  return relative === file ? null : relative;
}

/** Full-repo tree and editable viewer driven by the shared sandbox file list. */
export function FilesPanel({
  sandboxId,
  repoId,
  isActive,
  fileList,
  repos,
  activeRoot,
  onRootChange,
}: FilesPanelProps) {
  const [file] = useQueryState("file", fileViewerPathParser);
  const navigate = useNavigate();
  const { state: listState, isRefreshing, refresh } = fileList;
  const root = listState.kind === "loaded" ? listState.root : null;
  const selectedPath = deriveSelectedRelPath(file, root);
  // The repo directory's own name, so the tree's toolbar is labelled with the
  // repo rather than a generic "Files". Undefined (not "") when there is no
  // root yet, so the tree keeps its own fallback label.
  const rootLabel = root === null ? undefined : root.split("/").pop();

  // Below `md` the tree and the viewer are separate panes, so opening a file has
  // to move you to the file — otherwise the tap looks like it did nothing.
  const [showContentSignal, setShowContentSignal] = useState(0);

  // Reading order is a per-device habit, like the pane width beside it, so it
  // lives in localStorage rather than Convex. Stored as the raw string and
  // parsed on the way out, so an unexpected value degrades to the default
  // instead of being trusted as a side.
  const [storedSide, setStoredSide] = useLocalStorage<string>(
    "eva:file-tree-side",
    "left",
  );
  const side = fileTreeSideFromStorage(storedSide);

  const handleSelectFile = (relativePath: string) => {
    if (!root) return;
    // TanStack search object — not nuqs `setFile`. Nuqs concatenates
    // `pathname + '?file=/abs/path'`, which lands in `$sandboxTab` and the
    // unknown-tab fallback then sends the pane to Preview.
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, file: `${root}/${relativePath}` }),
    });
    setShowContentSignal((n) => n + 1);
  };

  const handleRootSelect = (nextRoot: string) => {
    if (nextRoot === (activeRoot ?? "")) return;
    onRootChange?.(nextRoot || null);
    // The previously open file belongs to the repo we are leaving.
    void setFile(null);
  };

  if (!sandboxId || !isActive) {
    return <ViewerNotice message="Wake Eva up to browse files" />;
  }

  const showRootSelector = repos !== undefined && repos.length > 1;

  return (
<<<<<<< HEAD
    <div className="flex h-full min-h-0 flex-col">
      {showRootSelector ? (
        <FilesRootSelector
          repos={repos}
          activeRoot={activeRoot ?? ""}
          onSelect={handleRootSelect}
=======
    <ResizableSidebar
      storageKey="sandbox-file-tree"
      mobilePaneLabels={{ left: "Files", right: "Viewer" }}
      showContentSignal={showContentSignal}
      side={side}
      // The 160/320 defaults add up to a 481px floor, which overflows the
      // sandbox pane on a tablet (and on a narrow desktop pane). Both sides
      // scroll their own content, so they can go narrower than the default.
      minSidebarWidthPx={140}
      minContentWidthPx={200}
      sidebar={
        listState.kind === "loading" || listState.kind === "idle" ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : listState.kind === "not_running" ? (
          <ViewerNotice message="Wake Eva up to browse files" />
        ) : listState.kind === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
            <pre className="max-h-48 max-w-full overflow-auto scroll-fade whitespace-pre-wrap rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
              {listState.message}
            </pre>
            <Button size="sm" variant="secondary" onClick={refresh}>
              <IconRefresh className="mr-1 size-4" />
              Retry
            </Button>
          </div>
        ) : listState.paths.length === 0 ? (
          <ViewerNotice message="No files found in the repository" />
        ) : (
          <SandboxFileTree
            key={`${sandboxId}:${listState.version}`}
            paths={listState.paths}
            truncated={listState.truncated}
            selectedPath={selectedPath}
            isRefreshing={isRefreshing}
            onRefresh={refresh}
            onSelectFile={handleSelectFile}
            rootLabel={rootLabel}
            side={side}
            onToggleSide={() => {
              setStoredSide(side === "left" ? "right" : "left");
            }}
          />
        )
      }
    >
      <div className="min-h-0 flex-1">
        <FileViewerPanel
          sandboxId={sandboxId}
          repoId={repoId}
          isActive={isActive}
          root={root}
>>>>>>> origin/main
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <ResizableSidebar
          storageKey="sandbox-file-tree"
          mobilePaneLabels={{ left: "Files", right: "Viewer" }}
          showContentSignal={showContentSignal}
          // The 160/320 defaults add up to a 481px floor, which overflows the
          // sandbox pane on a tablet (and on a narrow desktop pane). Both sides
          // scroll their own content, so they can go narrower than the default.
          minSidebarWidthPx={140}
          minContentWidthPx={200}
          sidebar={
            listState.kind === "loading" || listState.kind === "idle" ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : listState.kind === "not_running" ? (
              <ViewerNotice message="Wake Eva up to browse files" />
            ) : listState.kind === "error" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
                <pre className="max-h-48 max-w-full overflow-auto scroll-fade whitespace-pre-wrap rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
                  {listState.message}
                </pre>
                <Button size="sm" variant="secondary" onClick={refresh}>
                  <IconRefresh className="mr-1 size-4" />
                  Retry
                </Button>
              </div>
            ) : listState.paths.length === 0 ? (
              <ViewerNotice message="No files found in the repository" />
            ) : (
              <SandboxFileTree
                key={`${sandboxId}:${listState.version}`}
                paths={listState.paths}
                truncated={listState.truncated}
                selectedPath={selectedPath}
                isRefreshing={isRefreshing}
                onRefresh={refresh}
                onSelectFile={handleSelectFile}
              />
            )
          }
        >
          <div className="min-h-0 flex-1">
            <FileViewerPanel
              sandboxId={sandboxId}
              repoId={repoId}
              isActive={isActive}
            />
          </div>
        </ResizableSidebar>
      </div>
    </div>
  );
}
