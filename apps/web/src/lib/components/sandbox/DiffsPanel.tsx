"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import type { Id } from "@eva/backend";
import type { GitStatus } from "@pierre/trees";
import { Accordion, Spinner, motionBase, motionStagger } from "@eva/ui";
import { m } from "motion/react";
import { IconGitPullRequest, IconAlertTriangle } from "@tabler/icons-react";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { ResizableSidebar } from "@/lib/components/ResizableSidebar";
import { DiffFileTree } from "./DiffFileTree";
import { DiffFileAccordionItem } from "./DiffFileAccordionItem";
import { DiffsToolbar } from "./DiffsToolbar";
import { SubmitReviewPopover } from "./SubmitReviewPopover";
import { prNumberFromGithubUrl } from "@/lib/githubPr";
import { useDiffSearchParams } from "./useDiffSearchParams";
import { useDiffViewedFiles } from "./useDiffViewedFiles";
import { usePrDiff } from "./usePrDiff";
import { applyIgnoreWhitespace } from "./diffFiles";

interface DiffsPanelProps {
  /** PR URL for the current surface; absent when no PR exists yet. */
  prUrl?: string;
  repoId: Id<"githubRepos">;
}

/**
 * Sandbox "Diffs" tab. Renders the pushed PR diff (from GitHub) with
 * `@pierre/diffs`, in unified or split view, alongside a clickable
 * `@pierre/trees` file tree on the left for jumping straight to a file's diff.
 * Each file sits in a collapsible accordion with a GitHub-style Viewed checkbox
 * (persisted per PR in localStorage). The toolbar above owns the review chrome,
 * so every surface embedding this panel gets the same controls.
 */
export function DiffsPanel({ prUrl, repoId }: DiffsPanelProps) {
  "use no memo";
  const { resolvedTheme } = useThemeMode();
  const { diffView, setDiffView, diffFile, setDiffFile } =
    useDiffSearchParams();
  // Split view puts two code columns into a phone-width pane — roughly twenty
  // characters each — so below `md` the diff is always unified, whatever the URL
  // says. `@pierre/diffs` takes the style as a render option rather than a
  // layout, so a CSS breakpoint cannot express this; the matching Split trigger
  // is hidden in `DiffsToolbar` at the same breakpoint.
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const effectiveDiffView = isNarrow ? "unified" : diffView;
  const { isViewed, setViewed, viewedPaths } = useDiffViewedFiles(prUrl);
  const { state, refresh } = usePrDiff(prUrl, repoId);

  // Wrapping is a reading preference, so it persists across PRs and surfaces.
  const [wrapLines, setWrapLines] = useLocalStorage("eva:pr-diff-wrap", false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useLocalStorage(
    "eva:pr-diff-ignore-ws",
    false,
  );
  const [fileFilter, setFileFilter] = useState("");
  // Controlled accordion open set — independent of Viewed so a viewed file can
  // still be expanded to re-read without clearing the checkbox (GitHub UX).
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [showContentSignal, setShowContentSignal] = useState(0);
  const [seededFilesKey, setSeededFilesKey] = useState<string | null>(null);

  // Held in state, not a ref, because each file's body needs the element as its
  // IntersectionObserver root and has to re-observe once it exists.
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);

  // Wrapper element for each file's diff, keyed by path, so a tree click can
  // scroll the matching diff into view.
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setFileRef = useCallback(
    (path: string) => (el: HTMLDivElement | null) => {
      const map = fileRefs.current;
      if (el) map.set(path, el);
      else map.delete(path);
    },
    [],
  );

  // One entry per changed file: patch, path, status, and change counts. Parsed
  // once when the diff is fetched, not on every render.
  const rawEntries = state.status === "ready" ? state.entries : [];
  const fileEntries = ignoreWhitespace
    ? applyIgnoreWhitespace(rawEntries)
    : rawEntries;
  const filePaths = fileEntries.map((entry) => entry.path);
  const totals = fileEntries.reduce(
    (sum, entry) => ({
      additions: sum.additions + entry.additions,
      deletions: sum.deletions + entry.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
  const viewedCount = filePaths.filter((path) =>
    viewedPaths.includes(path),
  ).length;

  const query = fileFilter.trim().toLowerCase();
  const visibleEntries =
    query.length === 0
      ? fileEntries
      : fileEntries.filter((entry) => entry.path.toLowerCase().includes(query));
  const visiblePaths = visibleEntries.map((entry) => entry.path);
  const statuses = Object.fromEntries(
    visibleEntries.map((entry): [string, GitStatus] => [
      entry.path,
      entry.status,
    ]),
  );
  // Stable identity for the current file set: remounts the tree (whose model is
  // created once) whenever the listed files change.
  const filesKey = filePaths.join("\n");
  const visibleKey = visiblePaths.join("\n");

  // Re-seed open files when the changed set changes: open everything not yet
  // Viewed so returning reviewers land on collapsed progress.
  if (state.status === "ready" && filesKey !== seededFilesKey) {
    setSeededFilesKey(filesKey);
    setOpenPaths(filePaths.filter((path) => !viewedPaths.includes(path)));
  }

  const ensureOpen = (path: string) => {
    setOpenPaths((current) =>
      current.includes(path) ? current : [...current, path],
    );
  };

  // Selecting a file in the tree records it in the URL, expands its accordion,
  // and scrolls its header into view.
  const handleSelect = (path: string) => {
    setDiffFile(path);
    ensureOpen(path);
    // Below `md` the tree and the diff are separate panes, so picking a file has
    // to move you to that file's diff.
    setShowContentSignal((n) => n + 1);
    // Defer scroll until after the accordion open state commits.
    requestAnimationFrame(() => {
      fileRefs.current
        .get(path)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const handleViewedChange = (path: string, viewed: boolean) => {
    setViewed(path, viewed);
    // GitHub: checking Viewed collapses; unchecking expands.
    setOpenPaths((current) => {
      if (viewed) return current.filter((entry) => entry !== path);
      return current.includes(path) ? current : [...current, path];
    });
  };

  // On first load with a remembered file, expand + scroll to it once.
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    didInitialScrollRef.current = false;
  }, [filesKey]);
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (state.status !== "ready" || !diffFile) return;
    ensureOpen(diffFile);
    const el = fileRefs.current.get(diffFile);
    if (el) {
      el.scrollIntoView({ block: "start" });
      didInitialScrollRef.current = true;
    }
  }, [state.status, diffFile, filesKey]);

  if (!prUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconGitPullRequest className="h-10 w-10 text-muted-foreground/60" />
        <div className="max-w-md space-y-1">
          <p className="text-sm font-medium">No pull request yet</p>
          <p className="text-sm text-muted-foreground">
            Once a pull request is opened for this work, its diff will appear
            here.
          </p>
        </div>
      </div>
    );
  }

  const showTree = visibleEntries.length > 0;
  const prNumber = prNumberFromGithubUrl(prUrl);

  const fileDiffs = (
    <div ref={setScrollRoot} className="min-h-0 flex-1 overflow-auto">
      {state.status === "loading" ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : state.status === "error" ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <IconAlertTriangle className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            Could not load the pull request diff.
          </p>
        </div>
      ) : fileEntries.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No changes in this pull request yet.
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No files match “{fileFilter}”.
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {state.truncated ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Diff is large and has been truncated.
            </p>
          ) : null}
          <Accordion
            type="multiple"
            value={openPaths}
            onValueChange={setOpenPaths}
            className="flex flex-col gap-3"
          >
            {visibleEntries.map((entry, index) => (
              <m.div
                key={entry.path}
                ref={setFileRef(entry.path)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...motionBase, delay: motionStagger(index) }}
              >
                <DiffFileAccordionItem
                  entry={entry}
                  diffView={effectiveDiffView}
                  resolvedTheme={resolvedTheme}
                  viewed={isViewed(entry.path)}
                  onViewedChange={(viewed) =>
                    handleViewedChange(entry.path, viewed)
                  }
                  wrapLines={wrapLines}
                  repoId={repoId}
                  baseSha={state.baseSha}
                  headSha={state.headSha}
                  repoUrl={state.repoUrl}
                  scrollRoot={scrollRoot}
                  // The scroll target must exist before it can be scrolled to.
                  eager={diffFile === entry.path}
                />
              </m.div>
            ))}
          </Accordion>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DiffsToolbar
        fileCount={fileEntries.length}
        additions={totals.additions}
        deletions={totals.deletions}
        viewedCount={viewedCount}
        filter={fileFilter}
        onFilterChange={setFileFilter}
        diffView={effectiveDiffView}
        onDiffViewChange={setDiffView}
        wrapLines={wrapLines}
        onWrapLinesChange={setWrapLines}
        ignoreWhitespace={ignoreWhitespace}
        onIgnoreWhitespaceChange={setIgnoreWhitespace}
        allExpanded={
          visiblePaths.length > 0 &&
          visiblePaths.every((path) => openPaths.includes(path))
        }
        onExpandAll={() => setOpenPaths(filePaths)}
        onCollapseAll={() => setOpenPaths([])}
        isLoading={
          state.status === "loading" ||
          (state.status === "ready" && state.refreshing)
        }
        onRefresh={refresh}
        reviewAction={
          prNumber === undefined ? undefined : (
            <SubmitReviewPopover repoId={repoId} prNumber={prNumber} />
          )
        }
      />

      <div className="flex min-h-0 flex-1">
        {showTree ? (
          <ResizableSidebar
            storageKey="diff-file-tree"
            mobilePaneLabels={{ left: "Files", right: "Diff" }}
            showContentSignal={showContentSignal}
            // See FilesPanel: the 481px default floor overflows the sandbox
            // pane on a tablet. The diff body scrolls horizontally itself.
            minSidebarWidthPx={140}
            minContentWidthPx={200}
            sidebar={
              <DiffFileTree
                key={visibleKey}
                files={visiblePaths}
                statuses={statuses}
                initialSelectedPath={diffFile || null}
                onSelect={handleSelect}
              />
            }
          >
            {fileDiffs}
          </ResizableSidebar>
        ) : (
          fileDiffs
        )}
      </div>
    </div>
  );
}
