"use client";

import type { ReactNode } from "react";
import { DialogBody } from "@eva/ui";
import {
  DiffCountBar,
  FileStatusChip,
} from "@/lib/components/sandbox/DiffFileBadges";
import type { DiffFileEntry } from "@/lib/components/sandbox/diffFiles";
import { ReviewableFileDiff } from "@/lib/components/sandbox/ReviewableFileDiff";
import { NoPendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { useThemeMode } from "@/lib/hooks/useThemeMode";

/**
 * A read-only list of per-file diffs inside a dialog — one commit, or the span
 * between two checkpoints. Counts default to the sum over `entries`; callers
 * with GitHub's own commit totals pass them in.
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

  return (
    <DialogBody className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {changedFiles} changed {changedFiles === 1 ? "file" : "files"}
        </span>
        <DiffCountBar additions={additions} deletions={deletions} />
      </div>

      {/* Read-only: these line numbers belong to the commit, so a review comment
          drafted here would land on the wrong lines of the pull request diff. */}
      <NoPendingReviewComments>
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.path}
              className="overflow-hidden rounded-md border border-border"
            >
              <div className="flex min-w-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
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
            </div>
          ))}
        </div>
      </NoPendingReviewComments>

      {truncatedNotice}
    </DialogBody>
  );
}
