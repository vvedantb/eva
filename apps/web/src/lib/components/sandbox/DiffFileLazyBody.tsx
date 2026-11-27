"use client";

import type { ReactNode } from "react";
import { useIntersectionObserver } from "usehooks-ts";
import type { DiffView } from "@/lib/search-params";

/** Pierre's default diff line height, in px. */
const LINE_HEIGHT_PX = 20;
/** Height of a hunk separator row ("line-info" style), in px. */
const HUNK_SEPARATOR_PX = 29;
/** Vertical padding around the rendered diff body. */
const BODY_PADDING_PX = 8;
/**
 * How far outside the scroll container a file starts rendering. Roughly one
 * viewport of lookahead, so scrolling never lands on a placeholder.
 */
const LOOKAHEAD = "1000px 0px";

interface DiffFileLazyBodyProps {
  /** Change counts, used to reserve the right amount of space up front. */
  additions: number;
  deletions: number;
  contextLines: number;
  hunkCount: number;
  diffView: DiffView;
  /**
   * The scrolling ancestor. Must be the Diffs panel's own `overflow-auto`
   * element: with the default (viewport) root, every file below the panel's
   * visible area counts as intersecting and nothing is deferred.
   */
  scrollRoot: Element | null;
  /** Renders immediately, for the file a tree click or URL is scrolling to. */
  eager: boolean;
  children: ReactNode;
}

/**
 * Estimated rendered height of a file's diff. Only needs to be close enough
 * that the scrollbar does not jump noticeably when the real diff replaces the
 * placeholder — split view stacks changed lines side by side, so it is as tall
 * as the longer side rather than both sides combined.
 */
function estimateHeightPx({
  additions,
  deletions,
  contextLines,
  hunkCount,
  diffView,
}: Pick<
  DiffFileLazyBodyProps,
  "additions" | "deletions" | "contextLines" | "hunkCount" | "diffView"
>): number {
  const changedRows =
    diffView === "split"
      ? Math.max(additions, deletions)
      : additions + deletions;
  return (
    (contextLines + changedRows) * LINE_HEIGHT_PX +
    hunkCount * HUNK_SEPARATOR_PX +
    BODY_PADDING_PX
  );
}

/**
 * Defers mounting a file's diff until it is near the viewport. Every non-viewed
 * file in a PR is expanded at once (GitHub's behaviour, and the one reviewers
 * expect), which without this means highlighting the whole PR on the click that
 * opens the tab. The placeholder reserves the file's estimated height, so the
 * scrollbar and any scroll-into-view target stay where they belong.
 *
 * Mounting is one-way: once rendered, a file stays rendered, so scrolling back
 * over it never re-highlights and never loses a drafted comment.
 */
export function DiffFileLazyBody({
  additions,
  deletions,
  contextLines,
  hunkCount,
  diffView,
  scrollRoot,
  eager,
  children,
}: DiffFileLazyBodyProps) {
  const { ref, isIntersecting } = useIntersectionObserver({
    root: scrollRoot,
    rootMargin: LOOKAHEAD,
    freezeOnceVisible: true,
  });

  if (eager || isIntersecting) return <>{children}</>;

  return (
    <div
      ref={ref}
      style={{
        minHeight: estimateHeightPx({
          additions,
          deletions,
          contextLines,
          hunkCount,
          diffView,
        }),
      }}
    />
  );
}
