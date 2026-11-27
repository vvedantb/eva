"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { useLocalStorage } from "usehooks-ts";
import type { Id } from "@eva/backend";
import { cn } from "@eva/ui";
import { Button, Spinner } from "@vvedantb/ui";
import { IconFileText, IconRefresh } from "@tabler/icons-react";
import { toRepoRelativePath } from "@eva/shared";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { ResizableSidebar } from "@/lib/components/ResizableSidebar";
import type { SandboxFileListApi } from "@/lib/components/sandbox/useSandboxFileList";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { repoTileColor } from "@/lib/utils/repoTileColor";
import { fileViewerPathParser } from "@/lib/search-params";
import { FileViewerPanel } from "./FileViewerPanel";
import { SandboxFileTree } from "./_components/SandboxFileTree";
import { ViewerNotice } from "./_components/ViewerNotice";
import type { SessionRepoListItem } from "./_utils";
import { fileTreeSideFromStorage } from "./_utils/-fileTreeSide";
import {
  SandboxAsleepState,
  type SandboxWake,
} from "@/lib/components/sandbox/SandboxAsleepState";

interface FilesPanelProps {
  sandboxId: string | undefined;
  repoId: Id<"githubRepos">;
  isActive: boolean;
  fileList: SandboxFileListApi;
  repos?: SessionRepoListItem[];
  activeRoot?: string;
  onRootChange?: (root: string | null) => void;
  wake?: SandboxWake;
}

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
        const rootValue = repo.kind === "primary" ? "" : repo.path;
        const label = repoDisplayLabel(repo);
        const active = activeRoot === rootValue;
        const tile = repoTileColor(`${repo.owner}/${repo.name}/${label}`);
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
                    "flex size-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold",
                    tile.bg,
                    tile.text,
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
  wake,
}: FilesPanelProps) {
  const [file] = useQueryState("file", fileViewerPathParser);
  const navigate = useNavigate();
  const { state: listState, isRefreshing, refresh } = fileList;
  const root = listState.kind === "loaded" ? listState.root : null;
  const selectedPath = deriveSelectedRelPath(file, root);
  const rootLabel = root === null ? undefined : root.split("/").pop();

  const [showContentSignal, setShowContentSignal] = useState(0);

  const [storedSide, setStoredSide] = useLocalStorage<string>(
    "eva:file-tree-side",
    "left",
  );
  const side = fileTreeSideFromStorage(storedSide);

  const handleSelectFile = (relativePath: string) => {
    if (!root) return;
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, file: `${root}/${relativePath}` }),
    });
    setShowContentSignal((n) => n + 1);
  };

  const handleRootSelect = (nextRoot: string) => {
    if (nextRoot === (activeRoot ?? "")) return;
    onRootChange?.(nextRoot || null);
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, file: undefined }),
    });
  };

  if (!sandboxId || !isActive) {
    return (
      <SandboxAsleepState
        icon={IconFileText}
        label="Wake Eva up to browse files"
        wake={isActive ? undefined : wake}
      />
    );
  }

  const showRootSelector = repos !== undefined && repos.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showRootSelector ? (
        <FilesRootSelector
          repos={repos}
          activeRoot={activeRoot ?? ""}
          onSelect={handleRootSelect}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <ResizableSidebar
          storageKey="sandbox-file-tree"
          mobilePaneLabels={{ left: "Files", right: "Viewer" }}
          showContentSignal={showContentSignal}
          side={side}
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
            />
          </div>
        </ResizableSidebar>
      </div>
    </div>
  );
}
