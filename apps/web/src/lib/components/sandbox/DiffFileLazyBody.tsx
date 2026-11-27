"use client";

import type { ReactNode } from "react";
import { useIntersectionObserver } from "usehooks-ts";
import type { DiffView } from "@/lib/search-params";

const LINE_HEIGHT_PX = 20;
const HUNK_SEPARATOR_PX = 29;
const BODY_PADDING_PX = 8;
const LOOKAHEAD = "1000px 0px";

interface DiffFileLazyBodyProps {  additions: number;
  deletions: number;
  contextLines: number;
  hunkCount: number;
  diffView: DiffView;  scrollRoot: Element | null;  eager: boolean;
  children: ReactNode;
}

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
