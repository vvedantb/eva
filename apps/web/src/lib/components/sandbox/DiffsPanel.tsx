"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocalStorage } from "usehooks-ts";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import type { GitStatus } from "@pierre/trees";
import { Accordion, SearchInput, Spinner, toast } from "@eva/ui";
import { IconGitPullRequest, IconAlertTriangle } from "@tabler/icons-react";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { ResizableSidebar } from "@/lib/components/ResizableSidebar";
import { useRepo } from "@/lib/contexts/RepoContext";
import { commitDiffQuery } from "@/lib/prReviewQueries";
import type { PrCommit } from "@/lib/components/reviews/_components/prOverviewMeta";
import {
  NoPendingReviewComments,
  usePendingReviewComments,
} from "@/lib/contexts/PendingReviewCommentsContext";
import { DiffFileTree } from "./DiffFileTree";
import { DiffFileAccordionItem } from "./DiffFileAccordionItem";
import { DiffsToolbar } from "./DiffsToolbar";
import { useDiffSearchParams } from "./useDiffSearchParams";
import { useDiffViewedFiles } from "./useDiffViewedFiles";
import { usePrDiff } from "./usePrDiff";
import { applyIgnoreWhitespace, type DiffFileEntry } from "./diffFiles";

interface DiffsPanelProps {
  /** PR URL for the current surface; absent when no PR exists yet. */
  prUrl?: string;
  repoId: Id<"githubRepos">;
  /** The pull request's commits, to name the one Code is scoped to. */
  commits: readonly PrCommit[];
  /** A commit to scope the diff to; null for the whole change. */
  commit: string | null;
  onCommitChange: (sha: string | null) => void;
  /**
   * Where to render Code's controls — the tab row's right end — or null while
   * Code is not the open tab.
   */
  controlsSlot: HTMLElement | null;
}

/**
 * Code reads a size up from the 13/20 the diff renderer defaults to, as Cursor
 * sets it. Custom properties inherit into the renderer's shadow DOM.
 */
const CODE_TYPE_VARS: CSSProperties & Record<`--${string}`, string> = {
  "--diffs-font-size": "14px",
  "--diffs-line-height": "22px",
};

type DiffSource =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      entries: readonly DiffFileEntry[];
      truncated: boolean;
      /** Both ends of the diff, for "load full file"; null for a lone commit. */
      refs: { baseSha: string; headSha: string } | null;
      refreshing: boolean;
    };

/**
 * The Code tab, as Cursor has it: no toolbar of its own — its few controls
 * portal into the tab row — then a card per file and a file tree on the right
 * that can be folded away. Each card has a Viewed tick (persisted per pull
 * request), and checking one folds it, as GitHub does.
 *
 * Scoped to one commit, the diff is read-only: a line comment is anchored to the
 * whole change, so commenting is switched off until All commits is back.
 */
export function DiffsPanel({
  prUrl,
  repoId,
  commits,
  commit,
  onCommitChange,
  controlsSlot,
}: DiffsPanelProps) {
  "use no memo";
  const { resolvedTheme } = useThemeMode();
  const { owner, name } = useRepo();
  const { diffView, setDiffView, diffFile, setDiffFile } = useDiffSearchParams();
  // Split view puts two code columns into a phone-width pane, so below `md` the
  // diff is always unified, whatever the URL says.
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const effectiveDiffView = isNarrow ? "unified" : diffView;
  const { isViewed, setViewed, viewedPaths } = useDiffViewedFiles(prUrl);
  const { state: prState, refresh } = usePrDiff(prUrl, repoId);
  const getCommitDiff = useAction(api.github.getCommitDiff);
  const commitQuery = useQuery({
    ...commitDiffQuery(getCommitDiff, repoId, commit ?? ""),
    enabled: commit !== null,
  });

  const [wrapLines, setWrapLines] = useLocalStorage("eva:pr-diff-wrap", true);
  const [ignoreWhitespace, setIgnoreWhitespace] = useLocalStorage(
    "eva:pr-diff-ignore-ws",
    false,
  );
  const [treeOpen, setTreeOpen] = useLocalStorage("eva:pr-diff-tree-open", true);
  const review = usePendingReviewComments();

  const [fileFilter, setFileFilter] = useState("");
  // Controlled open set — independent of Viewed, so a viewed file can still be
  // expanded to re-read without clearing the tick (GitHub UX).
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [showContentSignal, setShowContentSignal] = useState(0);
  const [seededFilesKey, setSeededFilesKey] = useState<string | null>(null);
  // State, not a ref: each file body needs it as its IntersectionObserver root.
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setFileRef = (path: string) => (el: HTMLDivElement | null) => {
    if (el) fileRefs.current.set(path, el);
    else fileRefs.current.delete(path);
  };

  const source = ((): DiffSource => {
    if (commit === null) {
      if (prState.status !== "ready") return prState;
      return {
        status: "ready",
        entries: prState.entries,
        truncated: prState.truncated,
        refs: { baseSha: prState.baseSha, headSha: prState.headSha },
        refreshing: prState.refreshing,
      };
    }
    if (commitQuery.data !== undefined) {
      return {
        status: "ready",
        entries: commitQuery.data.entries,
        truncated: commitQuery.data.truncated,
        refs: null,
        refreshing: commitQuery.isFetching,
      };
    }
    return commitQuery.isError ? { status: "error" } : { status: "loading" };
  })();

  // A drafted review comment is anchored by its position in a walk of the patch
  // it was drawn on, and ignore-whitespace rewrites that patch. Flipping the
  // toggle underneath one would silently move it, so it is refused instead.
  const hasPendingComments = (review?.comments.length ?? 0) > 0;
  const handleIgnoreWhitespaceChange = (next: boolean) => {
    if (hasPendingComments) {
      toast.info(
        "Submit or delete pending review comments first — they are pinned to the lines on screen.",
      );
      return;
    }
    setIgnoreWhitespace(next);
  };

  const rawEntries = source.status === "ready" ? source.entries : [];
  const fileEntries = ignoreWhitespace ? applyIgnoreWhitespace(rawEntries) : rawEntries;
  const filePaths = fileEntries.map((entry) => entry.path);
  const scopedCommit = commits.find((entry) => entry.sha === commit);
  const query = fileFilter.trim().toLowerCase();
  const visibleEntries =
    query.length === 0
      ? fileEntries
      : fileEntries.filter((entry) => entry.path.toLowerCase().includes(query));
  const visiblePaths = visibleEntries.map((entry) => entry.path);
  const statuses = Object.fromEntries(
    fileEntries.map((entry): [string, GitStatus] => [entry.path, entry.status]),
  );
  // Remounts the tree (whose model is created once) when the listed files change.
  const filesKey = `${commit ?? "all"}\n${filePaths.join("\n")}`;
  const visibleKey = `${commit ?? "all"}\n${visiblePaths.join("\n")}`;

  // Re-seed open files when the changed set changes: open everything not yet
  // Viewed, so a returning reviewer lands on what is left.
  if (source.status === "ready" && filesKey !== seededFilesKey) {
    setSeededFilesKey(filesKey);
    setOpenPaths(filePaths.filter((path) => !viewedPaths.includes(path)));
  }

  const ensureOpen = (path: string) => {
    setOpenPaths((current) => (current.includes(path) ? current : [...current, path]));
  };

  const handleSelect = (path: string) => {
    setDiffFile(path);
    ensureOpen(path);
    // Below `md` the tree and the diff are separate panes.
    setShowContentSignal((n) => n + 1);
    requestAnimationFrame(() => {
      fileRefs.current.get(path)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const handleViewedChange = (path: string, viewed: boolean) => {
    setViewed(path, viewed);
    // GitHub: checking Viewed folds the file; unchecking unfolds it.
    setOpenPaths((current) => {
      if (viewed) return current.filter((entry) => entry !== path);
      return current.includes(path) ? current : [...current, path];
    });
  };

  // On first load with a remembered file, expand and scroll to it once.
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    didInitialScrollRef.current = false;
  }, [filesKey]);
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (source.status !== "ready" || !diffFile) return;
    ensureOpen(diffFile);
    const el = fileRefs.current.get(diffFile);
    if (el) {
      el.scrollIntoView({ block: "start" });
      didInitialScrollRef.current = true;
    }
  }, [source.status, diffFile, filesKey]);

  if (!prUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconGitPullRequest className="h-10 w-10 text-muted-foreground/60" />
        <div className="max-w-md space-y-1">
          <p className="text-sm font-medium">No pull request yet</p>
          <p className="text-sm text-muted-foreground">
            Once a pull request is opened for this work, its diff will appear here.
          </p>
        </div>
      </div>
    );
  }

  const repoUrl = `https://github.com/${owner}/${name}`;
  const fileDiffs = (
    <div
      ref={setScrollRoot}
      style={CODE_TYPE_VARS}
      className="min-h-0 flex-1 overflow-auto pb-20 [scrollbar-gutter:stable]"
    >
      {source.status === "loading" ? (
        <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner size="sm" />
          {commit === null ? "Loading pull request diff…" : "Loading commit diff…"}
        </div>
      ) : source.status === "error" ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <IconAlertTriangle className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">Could not load the diff.</p>
        </div>
      ) : fileEntries.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
          No net changes in this selection.
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
          No files match “{fileFilter}”.
        </div>
      ) : (
        <>
          {source.truncated ? (
            <p className="mx-4 mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              This diff exceeds the size limit. Changes shown are incomplete.
            </p>
          ) : null}
          {/* One card per file with room between them, as Cursor lays it out. */}
          <Accordion
            type="multiple"
            value={openPaths}
            onValueChange={setOpenPaths}
            className="flex flex-col gap-4 p-4"
          >
            {visibleEntries.map((entry) => (
              <div key={entry.path} ref={setFileRef(entry.path)} className="scroll-mt-4">
                <DiffFileAccordionItem
                  entry={entry}
                  diffView={effectiveDiffView}
                  resolvedTheme={resolvedTheme}
                  viewed={isViewed(entry.path)}
                  onViewedChange={(viewed) => handleViewedChange(entry.path, viewed)}
                  wrapLines={wrapLines}
                  repoId={repoId}
                  refs={source.refs}
                  repoUrl={repoUrl}
                  viewRef={source.refs?.headSha ?? commit ?? "HEAD"}
                  scrollRoot={scrollRoot}
                  // The scroll target must exist before it can be scrolled to.
                  eager={diffFile === entry.path}
                />
              </div>
            ))}
          </Accordion>
        </>
      )}
    </div>
  );

  const tree = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-3 pb-2">
        <SearchInput
          value={fileFilter}
          onChange={setFileFilter}
          onClear={() => setFileFilter("")}
          placeholder="Search files"
          className="w-full max-w-none"
          inputClassName="h-9 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1">
        <DiffFileTree
          key={visibleKey}
          files={visiblePaths}
          statuses={statuses}
          initialSelectedPath={diffFile || null}
          onSelect={handleSelect}
          density="relaxed"
        />
      </div>
    </div>
  );

  const body =
    treeOpen && fileEntries.length > 0 ? (
      <ResizableSidebar
        // A new key, so widths remembered from the old narrow tree do not
        // carry over and cut file names off again.
        storageKey="diff-file-tree-code"
        defaultWidth="340px"
        side="right"
        mobilePaneLabels={{ left: "Files", right: "Diff" }}
        showContentSignal={showContentSignal}
        minSidebarWidthPx={220}
        minContentWidthPx={320}
        sidebar={tree}
      >
        {fileDiffs}
      </ResizableSidebar>
    ) : (
      fileDiffs
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {controlsSlot === null
        ? null
        : createPortal(
            <DiffsToolbar
              scopedCommit={
                scopedCommit === undefined
                  ? null
                  : {
                      sha: scopedCommit.sha,
                      headline: scopedCommit.message.split("\n")[0] ?? "",
                    }
              }
              onClearScope={() => onCommitChange(null)}
              diffView={effectiveDiffView}
              onDiffViewChange={setDiffView}
              wrapLines={wrapLines}
              onWrapLinesChange={setWrapLines}
              ignoreWhitespace={ignoreWhitespace}
              onIgnoreWhitespaceChange={handleIgnoreWhitespaceChange}
              allExpanded={
                visiblePaths.length > 0 &&
                visiblePaths.every((path) => openPaths.includes(path))
              }
              onExpandAll={() => setOpenPaths(filePaths)}
              onCollapseAll={() => setOpenPaths([])}
              isLoading={
                source.status === "loading" ||
                (source.status === "ready" && source.refreshing)
              }
              onRefresh={commit === null ? refresh : () => void commitQuery.refetch()}
              treeOpen={treeOpen}
              onTreeOpenChange={setTreeOpen}
            />,
            controlsSlot,
          )}
      <div className="flex min-h-0 flex-1">
        {commit === null ? body : <NoPendingReviewComments>{body}</NoPendingReviewComments>}
      </div>
    </div>
  );
}
