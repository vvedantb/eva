"use client";

import { useId, useState, type ReactNode } from "react";
import type { GitStatus } from "@pierre/trees";
import { cn, DialogBody } from "@eva/ui";
import { ResizableSidebar } from "@/lib/components/ResizableSidebar";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  DiffCountBar,
  FileStatusChip,
} from "@/lib/components/sandbox/DiffFileBadges";
import { DiffFileTree } from "@/lib/components/sandbox/DiffFileTree";
import type { DiffFileEntry } from "@/lib/components/sandbox/diffFiles";
import { ReviewableFileDiff } from "@/lib/components/sandbox/ReviewableFileDiff";
import { NoPendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { useThemeMode } from "@/lib/hooks/useThemeMode";

/**
 * A read-only list of per-file diffs inside a dialog — one commit, or the span
 * between two checkpoints. Counts default to the sum over `entries`; callers
 * with GitHub's own commit totals pass them in.
 *
 * With more than one file, the Diffs tab's file tree sits on the left and a
 * click scrolls that file's diff into view.
 */
export function DiffEntriesDialogBody({
  entries,
  additions: additionsProp,
  deletions: deletionsProp,
  changedFiles: changedFilesProp,
  truncatedNotice,
}: {
  entries: readonly DiffFileEntry[];
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  /** Shown under the diff when the payload was clipped; null when it was not. */
  truncatedNotice: ReactNode;
}) {
  const { resolvedTheme } = useThemeMode();
  // Computed as statements rather than parameter defaults: React Compiler
  // cannot reorder calls/member access in a default initialiser and bails.
  const additions =
    additionsProp ?? entries.reduce((sum, entry) => sum + entry.additions, 0);
  const deletions =
    deletionsProp ?? entries.reduce((sum, entry) => sum + entry.deletions, 0);
  const changedFiles = changedFilesProp ?? entries.length;
  // Scroll targets are found by id, not a ref map: `${fileIdPrefix}-${index}`.
  const fileIdPrefix = useId();
  // Below `md` the tree and the diffs are separate panes; a pick switches over.
  const [showContentSignal, setShowContentSignal] = useState(0);
  const paths = entries.map((entry) => entry.path);
  const statuses = Object.fromEntries(
    entries.map((entry): [string, GitStatus] => [entry.path, entry.status]),
  );

  const handleSelect = (path: string) => {
    setShowContentSignal((n) => n + 1);
    // Next frame: on mobile the diff pane has only just been shown.
    requestAnimationFrame(() => {
      document
        .getElementById(`${fileIdPrefix}-${paths.indexOf(path)}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const fileDiffs = (
    <div
      className={cn(
        "min-h-0 flex-1 space-y-3 overflow-y-auto",
        entries.length > 1 && "pl-3",
      )}
    >
      {/* Read-only: these line numbers belong to the commit, so a review comment
          drafted here would land on the wrong lines of the pull request diff. */}
      <NoPendingReviewComments>
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <ListEnter
              key={entry.path}
              index={index}
              fast
              slide={false}
              className="overflow-hidden rounded-md border border-border"
            >
              <div
                id={`${fileIdPrefix}-${index}`}
                className="flex min-w-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-2"
              >
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs"
                  title={entry.path}
                >
                  {entry.path}
                </span>
                <FileStatusChip status={entry.status} />
                <DiffCountBar
                  additions={entry.additions}
                  deletions={entry.deletions}
                />
              </div>

              {entry.binary || !entry.hasHunks ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  {entry.binary
                    ? "Binary file not shown."
                    : "No line changes in this file."}
                </p>
              ) : (
                <ReviewableFileDiff
                  patch={entry.patch}
                  path={entry.path}
                  diffView="unified"
                  resolvedTheme={resolvedTheme}
                  hideFileHeader
                />
              )}
            </ListEnter>
          ))}
        </div>
      </NoPendingReviewComments>

      {truncatedNotice}
    </div>
  );

  return (
    <DialogBody
      className={cn(
        "flex flex-col gap-3",
        // The split needs a definite height to scroll its two panes apart.
        entries.length > 1 && "h-[75dvh] overflow-hidden",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {changedFiles} changed {changedFiles === 1 ? "file" : "files"}
        </span>
        <DiffCountBar additions={additions} deletions={deletions} />
      </div>

      {entries.length > 1 ? (
        <div className="min-h-0 flex-1">
          <ResizableSidebar
            storageKey="diff-dialog-file-tree"
            mobilePaneLabels={{ left: "Files", right: "Diff" }}
            showContentSignal={showContentSignal}
            minSidebarWidthPx={140}
            minContentWidthPx={200}
            sidebar={
              <DiffFileTree
                key={paths.join("\n")}
                files={paths}
                statuses={statuses}
                initialSelectedPath={null}
                onSelect={handleSelect}
              />
            }
          >
            {fileDiffs}
          </ResizableSidebar>
        </div>
      ) : (
        fileDiffs
      )}
    </DialogBody>
  );
}
