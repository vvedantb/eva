"use client";

import type {
  AnnotationSide,
  DiffLineAnnotation,
  FileDiffMetadata,
  FileDiffOptions,
  SelectedLineRange,
  ThemeTypes,
} from "@pierre/diffs";
import { getSingularPatch, parseDiffFromFile } from "@pierre/diffs";
import { FileDiff, PatchDiff, useStableCallback } from "@pierre/diffs/react";
import { useState } from "react";
import {
  buildDiffReviewComment,
  restoreReviewCommentRange,
} from "@/lib/reviewComments";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import {
  DiffCommentDraftBox,
  DiffCommentPendingCard,
} from "@/lib/components/sandbox/DiffCommentBox";
import { DIFF_THEMES } from "@/lib/components/sandbox/diffWorkerPool";

interface DiffCommentAnnotationEntry {
  readonly id: string;
  readonly kind: "draft" | "comment";
  readonly range: SelectedLineRange;
  readonly rangeLabel: string;
  readonly text: string;
}

interface DiffCommentAnnotationGroup {
  readonly entries: ReadonlyArray<DiffCommentAnnotationEntry>;
}

type DiffCommentLineAnnotation = DiffLineAnnotation<DiffCommentAnnotationGroup>;

/** Full file contents at both ends of the PR, once loaded for a file. */
export interface FullFileContents {
  readonly oldContents: string;
  readonly newContents: string;
}

interface ReviewableFileDiffProps {
  patch: string;
  path: string;
  diffView: "unified" | "split";
  resolvedTheme: ThemeTypes;
  /** When true, hide Pierre's built-in file header (parent accordion owns chrome). */
  hideFileHeader?: boolean;
  /** Soft-wrap long lines instead of scrolling horizontally. */
  wrapLines?: boolean;
  /**
   * When present, the diff is regenerated from whole files instead of the PR
   * patch. That is what unlocks GitHub-style "expand unchanged lines": a patch
   * only carries a few lines of context, so Pierre marks it partial and hides
   * the expansion controls.
   */
  fullFile?: FullFileContents;
}

function annotationSide(range: SelectedLineRange): AnnotationSide {
  return (range.endSide ?? range.side) === "deletions"
    ? "deletions"
    : "additions";
}

function appendAnnotationEntry(
  annotations: ReadonlyArray<DiffCommentLineAnnotation>,
  range: SelectedLineRange,
  entry: DiffCommentAnnotationEntry,
): DiffCommentLineAnnotation[] {
  const side = annotationSide(range);
  const annotationIndex = annotations.findIndex(
    (annotation) =>
      annotation.side === side && annotation.lineNumber === range.end,
  );
  if (annotationIndex < 0) {
    return [
      ...annotations,
      {
        side,
        lineNumber: range.end,
        metadata: { entries: [entry] },
      },
    ];
  }
  return annotations.map((annotation, index) =>
    index === annotationIndex
      ? {
          ...annotation,
          metadata: { entries: [...annotation.metadata.entries, entry] },
        }
      : annotation,
  );
}

function createCommentId(): string {
  return crypto.randomUUID();
}

/**
 * Rendering options shared by every path below. `line-info` separators and
 * word-level intra-line diffing are what make the output read like GitHub's.
 */
function diffOptions<LAnnotation>({
  diffView,
  resolvedTheme,
  hideFileHeader,
  wrapLines,
}: Pick<
  ReviewableFileDiffProps,
  "diffView" | "resolvedTheme" | "hideFileHeader" | "wrapLines"
  // `Caret` types externally owned carets, which this surface never renders,
  // so it stays `undefined` everywhere the options are named.
>): FileDiffOptions<LAnnotation, undefined> {
  return {
    diffStyle: diffView,
    // Must match the worker pool's own render options — the pool's win when one
    // is mounted, so a mismatch here would silently restyle every diff.
    theme: DIFF_THEMES,
    themeType: resolvedTheme,
    disableFileHeader: hideFileHeader === true,
    overflow: wrapLines === true ? "wrap" : "scroll",
    hunkSeparators: "line-info",
    lineDiffType: "word",
  };
}

/**
 * Read-only rendering, used outside a review session (no pending-comment
 * context) or when the patch cannot be parsed into a file diff.
 */
function PlainDiff({
  patch,
  fileDiff,
  ...rest
}: Omit<ReviewableFileDiffProps, "path" | "fullFile"> & {
  fileDiff: FileDiffMetadata | null;
}) {
  const options = diffOptions(rest);
  if (fileDiff === null) {
    return <PatchDiff patch={patch} options={options} />;
  }
  return <FileDiff fileDiff={fileDiff} options={options} />;
}

function AnnotatableDiff({
  path,
  diffView,
  resolvedTheme,
  hideFileHeader,
  wrapLines,
  renderFileDiff,
  commentFileDiff,
  review,
}: Pick<
  ReviewableFileDiffProps,
  "path" | "diffView" | "resolvedTheme" | "hideFileHeader" | "wrapLines"
> & {
  /** The diff actually rendered — from whole files when expansion is on. */
  renderFileDiff: FileDiffMetadata;
  /**
   * The patch-derived diff comments are anchored against. Comment positions are
   * indices into a hunk walk, and those indices differ between the patch and a
   * whole-file diff, so anchoring always uses the patch. Ranges resolve to
   * absolute line numbers, which are the same in both.
   */
  commentFileDiff: FileDiffMetadata;
  review: NonNullable<ReturnType<typeof usePendingReviewComments>>;
}) {
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(
    null,
  );
  const [draft, setDraft] = useState<{
    id: string;
    range: SelectedLineRange;
    rangeLabel: string;
  } | null>(null);

  const lineAnnotations = (() => {
    const persisted = review.comments
      .filter((comment) => comment.filePath === path)
      .reduce<DiffCommentLineAnnotation[]>((annotations, comment) => {
        const range = restoreReviewCommentRange(commentFileDiff, comment);
        if (!range) return annotations;
        return appendAnnotationEntry(annotations, range, {
          id: comment.id,
          kind: "comment",
          range,
          rangeLabel: comment.rangeLabel,
          text: comment.text,
        });
      }, []);

    if (!draft) return persisted;

    return appendAnnotationEntry(persisted, draft.range, {
      id: draft.id,
      kind: "draft",
      range: draft.range,
      rangeLabel: draft.rangeLabel,
      text: "",
    });
  })();

  const removeEntry = (entryId: string) => {
    setSelectedLines(null);
    if (draft?.id === entryId) {
      setDraft(null);
      return;
    }
    review.remove(entryId);
  };

  const submitEntry = (entryId: string, text: string) => {
    if (!draft || draft.id !== entryId) return;
    const comment = buildDiffReviewComment({
      id: entryId,
      filePath: path,
      fileDiff: commentFileDiff,
      range: draft.range,
      text,
    });
    if (comment) review.add(comment);
    setSelectedLines(null);
    setDraft(null);
  };

  const onLineSelectionEnd = useStableCallback(
    (range: SelectedLineRange | null) => {
      if (!range || draft !== null) return;
      const id = createCommentId();
      const preview = buildDiffReviewComment({
        id,
        filePath: path,
        fileDiff: commentFileDiff,
        range,
        text: "",
      });
      // Null means the selection falls outside the PR's own diff (an expanded
      // context line, say) — there is nothing for the agent to review there.
      if (!preview) return;
      setSelectedLines(range);
      setDraft({
        id,
        range,
        rangeLabel: preview.rangeLabel,
      });
    },
  );

  const onLineSelected = useStableCallback(
    (range: SelectedLineRange | null) => {
      setSelectedLines(range);
    },
  );

  const hasOpenDraft = draft !== null;

  const options: FileDiffOptions<DiffCommentAnnotationGroup, undefined> = {
    ...diffOptions<DiffCommentAnnotationGroup>({
      diffView,
      resolvedTheme,
      hideFileHeader,
      wrapLines,
    }),
    enableLineSelection: !hasOpenDraft,
    onLineSelectionEnd,
    onLineSelected,
  };

  const renderAnnotation = useStableCallback(
    (annotation: DiffCommentLineAnnotation) => (
      <div className="py-1">
        {annotation.metadata.entries.map((entry) =>
          entry.kind === "draft" ? (
            <DiffCommentDraftBox
              key={entry.id}
              rangeLabel={entry.rangeLabel}
              onCancel={() => removeEntry(entry.id)}
              onSubmit={(text) => submitEntry(entry.id, text)}
            />
          ) : (
            <DiffCommentPendingCard
              key={entry.id}
              rangeLabel={entry.rangeLabel}
              text={entry.text}
              onDelete={() => removeEntry(entry.id)}
            />
          ),
        )}
      </div>
    ),
  );

  return (
    <FileDiff<DiffCommentAnnotationGroup>
      fileDiff={renderFileDiff}
      options={options}
      selectedLines={selectedLines}
      lineAnnotations={lineAnnotations}
      renderAnnotation={renderAnnotation}
    />
  );
}

/** Parses the PR patch for one file; null when it is not a diff we can render. */
function parsePatch(patch: string): FileDiffMetadata | null {
  try {
    return getSingularPatch(patch);
  } catch {
    return null;
  }
}

/** Builds a whole-file diff, which carries every line and so can be expanded. */
function parseFullFile(
  path: string,
  fullFile: FullFileContents,
): FileDiffMetadata | null {
  try {
    return parseDiffFromFile(
      { name: path, contents: fullFile.oldContents },
      { name: path, contents: fullFile.newContents },
    );
  } catch {
    return null;
  }
}

export function ReviewableFileDiff({
  fullFile,
  ...props
}: ReviewableFileDiffProps) {
  const review = usePendingReviewComments();
  const commentFileDiff = parsePatch(props.patch);
  const expandedFileDiff =
    fullFile !== undefined ? parseFullFile(props.path, fullFile) : null;
  const renderFileDiff = expandedFileDiff ?? commentFileDiff;

  if (!review || commentFileDiff === null || renderFileDiff === null) {
    return <PlainDiff {...props} fileDiff={renderFileDiff} />;
  }

  return (
    <AnnotatableDiff
      {...props}
      renderFileDiff={renderFileDiff}
      commentFileDiff={commentFileDiff}
      review={review}
    />
  );
}
