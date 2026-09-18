import type {
  FileDiffMetadata,
  SelectedLineRange,
  SelectionSide,
} from "@pierre/diffs";
import { z } from "zod";

type ReviewCommentSide = "LEFT" | "RIGHT";

/**
 * Where a comment attaches in GitHub's review model: a line number on one side
 * of the diff (`LEFT` is the base file, `RIGHT` the head file), plus a start
 * line for a multi-line comment.
 */
interface ReviewCommentAnchor {
  readonly line: number;
  readonly side: ReviewCommentSide;
  readonly startLine: number | null;
  readonly startSide: ReviewCommentSide | null;
}

export interface ReviewComment {
  readonly id: string;
  readonly filePath: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly rangeLabel: string;
  readonly text: string;
  readonly diff: string;
  /**
   * Null for comments parsed back out of an agent message: those carry only
   * diff-relative indices, which GitHub cannot anchor a review comment to.
   */
  readonly anchor: ReviewCommentAnchor | null;
}

export type ReviewCommentMessageSegment =
  | {
      readonly kind: "text";
      readonly id: string;
      readonly text: string;
    }
  | {
      readonly kind: "review-comment";
      readonly comment: ReviewComment;
    };

interface DiffReviewLine {
  readonly change: "context" | "add" | "delete";
  readonly oldLineNumber: number | null;
  readonly newLineNumber: number | null;
  readonly content: string;
}

const REVIEW_COMMENT_BLOCK_PATTERN =
  /<review_comment\b([^>]*)>\s*([\s\S]*?)<\/review_comment>/g;
const REVIEW_COMMENT_ATTRIBUTE_PATTERN = /([a-zA-Z][a-zA-Z0-9_-]*)="([^"]*)"/g;
const REVIEW_COMMENT_FENCE_PATTERN = /(`{3,})([^\s`]*)[^\n]*\n([\s\S]*?)\n\1/g;

const reviewCommentAttributesSchema = z.object({
  filePath: z.string().trim().min(1),
  startIndex: z.coerce.number().int().nonnegative(),
  endIndex: z.coerce.number().int().nonnegative(),
  lines: z.string().trim().optional(),
});

function escapeReviewCommentAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeReviewCommentAttribute(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function readReviewCommentAttributes(
  rawAttributes: string,
): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of rawAttributes.matchAll(
    REVIEW_COMMENT_ATTRIBUTE_PATTERN,
  )) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      attributes[name] = unescapeReviewCommentAttribute(value);
    }
  }
  return attributes;
}

function extractReviewCommentBody(rawBody: string): {
  text: string;
  contents: string;
} {
  const matches = Array.from(rawBody.matchAll(REVIEW_COMMENT_FENCE_PATTERN));
  const match = matches.at(-1);
  const fenceIndex = match?.index;
  return {
    text: rawBody.slice(0, fenceIndex ?? rawBody.length).trim(),
    contents: match?.[3] ?? "",
  };
}

function parseReviewCommentBlock(
  rawAttributes: string,
  rawBody: string,
  index: number,
): ReviewComment | null {
  const attributesResult = reviewCommentAttributesSchema.safeParse(
    readReviewCommentAttributes(rawAttributes),
  );
  if (!attributesResult.success) {
    return null;
  }
  const attributes = attributesResult.data;
  const startIndex = Math.min(attributes.startIndex, attributes.endIndex);
  const endIndex = Math.max(attributes.startIndex, attributes.endIndex);
  const body = extractReviewCommentBody(rawBody);

  return {
    id: `review-comment:${index}:${attributes.filePath}:${startIndex}:${endIndex}`,
    filePath: attributes.filePath,
    startIndex,
    endIndex,
    rangeLabel: attributes.lines ?? "line",
    text: body.text,
    diff: body.contents,
    anchor: null,
  };
}

export function parseReviewCommentSegments(
  value: string,
): ReadonlyArray<ReviewCommentMessageSegment> {
  const segments: ReviewCommentMessageSegment[] = [];
  let cursor = 0;
  let parsedCommentIndex = 0;

  for (const match of value.matchAll(REVIEW_COMMENT_BLOCK_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const beforeText = value.slice(cursor, matchIndex);
    if (beforeText.length > 0) {
      segments.push({
        kind: "text",
        id: `review-comment-text:${cursor}`,
        text: beforeText,
      });
    }

    const comment = parseReviewCommentBlock(
      match[1] ?? "",
      match[2] ?? "",
      parsedCommentIndex,
    );
    if (comment) {
      segments.push({ kind: "review-comment", comment });
      parsedCommentIndex += 1;
    } else {
      segments.push({
        kind: "text",
        id: `review-comment-invalid:${matchIndex}`,
        text: match[0],
      });
    }

    cursor = matchIndex + match[0].length;
  }

  const rest = value.slice(cursor);
  if (rest.length > 0) {
    segments.push({
      kind: "text",
      id: `review-comment-text:${cursor}`,
      text: rest,
    });
  }

  return segments;
}

export function stripReviewCommentBlocks(value: string): {
  text: string;
  reviewCommentCount: number;
} {
  let reviewCommentCount = 0;
  const stripped = value.replace(
    REVIEW_COMMENT_BLOCK_PATTERN,
    (block, rawAttributes: string, rawBody: string) => {
      const comment = parseReviewCommentBlock(
        rawAttributes,
        rawBody,
        reviewCommentCount,
      );
      if (comment) {
        reviewCommentCount += 1;
        return "";
      }
      return block;
    },
  );

  return {
    text: stripped.replace(/\n{3,}/g, "\n\n").trim(),
    reviewCommentCount,
  };
}

function formatReviewCommentFence(language: string, contents: string): string {
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(contents.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return [`${fence}${language}`, contents.trimEnd(), fence].join("\n");
}

function formatReviewComment(comment: ReviewComment): string {
  return [
    [
      "<review_comment",
      ` filePath="${escapeReviewCommentAttribute(comment.filePath)}"`,
      ` lines="${escapeReviewCommentAttribute(comment.rangeLabel)}"`,
      ` startIndex="${comment.startIndex}"`,
      ` endIndex="${comment.endIndex}"`,
      ">",
    ].join(""),
    comment.text.trim(),
    formatReviewCommentFence("diff", comment.diff),
    "</review_comment>",
  ].join("\n");
}

export function appendReviewCommentsToPrompt(
  prompt: string,
  comments: ReadonlyArray<ReviewComment>,
): string {
  const blocks = comments.map(formatReviewComment);
  if (blocks.length === 0) return prompt;
  const trimmedPrompt = prompt.trim();
  return trimmedPrompt.length > 0
    ? `${trimmedPrompt}\n\n${blocks.join("\n\n")}`
    : blocks.join("\n\n");
}

function stripTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function buildDiffReviewLines(
  fileDiff: FileDiffMetadata,
): ReadonlyArray<DiffReviewLine> {
  const rows: DiffReviewLine[] = [];

  for (const hunk of fileDiff.hunks) {
    let oldLineNumber = hunk.deletionStart;
    let newLineNumber = hunk.additionStart;
    let deletionLineIndex = hunk.deletionLineIndex;
    let additionLineIndex = hunk.additionLineIndex;

    for (const segment of hunk.hunkContent) {
      if (segment.type === "context") {
        for (let index = 0; index < segment.lines; index += 1) {
          const additionLine = fileDiff.additionLines[additionLineIndex];
          const deletionLine = fileDiff.deletionLines[deletionLineIndex];
          rows.push({
            change: "context",
            oldLineNumber,
            newLineNumber,
            content: stripTrailingNewline(additionLine ?? deletionLine ?? ""),
          });
          oldLineNumber += 1;
          newLineNumber += 1;
          deletionLineIndex += 1;
          additionLineIndex += 1;
        }
        continue;
      }

      for (let index = 0; index < segment.deletions; index += 1) {
        rows.push({
          change: "delete",
          oldLineNumber,
          newLineNumber: null,
          content: stripTrailingNewline(
            fileDiff.deletionLines[deletionLineIndex] ?? "",
          ),
        });
        oldLineNumber += 1;
        deletionLineIndex += 1;
      }

      for (let index = 0; index < segment.additions; index += 1) {
        rows.push({
          change: "add",
          oldLineNumber: null,
          newLineNumber,
          content: stripTrailingNewline(
            fileDiff.additionLines[additionLineIndex] ?? "",
          ),
        });
        newLineNumber += 1;
        additionLineIndex += 1;
      }
    }
  }

  return rows;
}

function getDiffReviewSelectionPoint(
  line: DiffReviewLine,
): { lineNumber: number; side: SelectionSide } | null {
  if (line.change === "delete" && line.oldLineNumber !== null) {
    return { lineNumber: line.oldLineNumber, side: "deletions" };
  }
  if (line.newLineNumber !== null) {
    return { lineNumber: line.newLineNumber, side: "additions" };
  }
  if (line.oldLineNumber !== null) {
    return { lineNumber: line.oldLineNumber, side: "deletions" };
  }
  return null;
}

export function restoreReviewCommentRange(
  fileDiff: FileDiffMetadata,
  comment: ReviewComment,
): SelectedLineRange | null {
  const lines = buildDiffReviewLines(fileDiff);
  const startLine = lines[comment.startIndex];
  const endLine = lines[comment.endIndex];
  if (!startLine || !endLine) return null;
  const start = getDiffReviewSelectionPoint(startLine);
  const end = getDiffReviewSelectionPoint(endLine);
  if (!start || !end) return null;
  return {
    start: start.lineNumber,
    side: start.side,
    end: end.lineNumber,
    endSide: end.side,
  };
}

function findDiffReviewLineIndex(
  lines: ReadonlyArray<DiffReviewLine>,
  lineNumber: number,
  side: SelectionSide | undefined,
): number {
  const preferredKey = side === "deletions" ? "oldLineNumber" : "newLineNumber";
  const preferredIndex = lines.findIndex(
    (line) => line[preferredKey] === lineNumber,
  );
  if (preferredIndex >= 0) return preferredIndex;
  const fallbackKey =
    preferredKey === "oldLineNumber" ? "newLineNumber" : "oldLineNumber";
  return lines.findIndex((line) => line[fallbackKey] === lineNumber);
}

function getDiffRange(
  lines: ReadonlyArray<DiffReviewLine>,
  key: "oldLineNumber" | "newLineNumber",
): { start: number; count: number } {
  const numberedLines = lines.filter((line) => line[key] !== null);
  const first = numberedLines[0];
  return {
    start: first?.[key] ?? 0,
    count: numberedLines.length,
  };
}

function getDiffChangeMarker(change: DiffReviewLine["change"]): string {
  if (change === "add") return "+";
  if (change === "delete") return "-";
  return " ";
}

function formatDiffReviewRangeLabel(
  lines: ReadonlyArray<DiffReviewLine>,
): string {
  const firstLine = lines[0];
  const lastLine = lines.at(-1);
  if (!firstLine || !lastLine) return "line";
  const firstNumber = firstLine.newLineNumber ?? firstLine.oldLineNumber;
  const lastNumber = lastLine.newLineNumber ?? lastLine.oldLineNumber;
  if (firstNumber === null || lastNumber === null) {
    return lines.length === 1 ? "line" : `${lines.length} lines`;
  }

  const firstMarker = getDiffChangeMarker(firstLine.change).trim();
  const marker =
    firstMarker.length > 0 &&
    lines.every((line) => line.change === firstLine.change)
      ? firstMarker
      : "";
  return firstNumber === lastNumber
    ? `${marker}${firstNumber}`
    : `${marker}${firstNumber} to ${marker}${lastNumber}`;
}

function getReviewCommentAnchorPoint(
  line: DiffReviewLine,
): { line: number; side: ReviewCommentSide } | null {
  const point = getDiffReviewSelectionPoint(line);
  if (!point) return null;
  return {
    line: point.lineNumber,
    side: point.side === "deletions" ? "LEFT" : "RIGHT",
  };
}

/**
 * Resolves a selected line span to GitHub's anchor: the last line carries the
 * comment, and a start line is only sent when the span really covers more than
 * that one line (GitHub rejects a start equal to the end).
 */
function buildReviewCommentAnchor(
  lines: ReadonlyArray<DiffReviewLine>,
): ReviewCommentAnchor | null {
  const firstLine = lines[0];
  const lastLine = lines.at(-1);
  if (!firstLine || !lastLine) return null;
  const start = getReviewCommentAnchorPoint(firstLine);
  const end = getReviewCommentAnchorPoint(lastLine);
  if (!start || !end) return null;

  const isMultiLine = start.side !== end.side || start.line < end.line;
  return {
    line: end.line,
    side: end.side,
    startLine: isMultiLine ? start.line : null,
    startSide: isMultiLine ? start.side : null,
  };
}

export function buildDiffReviewComment(input: {
  id: string;
  filePath: string;
  fileDiff: FileDiffMetadata;
  range: SelectedLineRange;
  text: string;
}): ReviewComment | null {
  const lines = buildDiffReviewLines(input.fileDiff);
  const startIndex = findDiffReviewLineIndex(
    lines,
    input.range.start,
    input.range.side,
  );
  const endIndex = findDiffReviewLineIndex(
    lines,
    input.range.end,
    input.range.endSide ?? input.range.side,
  );
  if (startIndex < 0 || endIndex < 0) return null;

  const normalizedStartIndex = Math.min(startIndex, endIndex);
  const normalizedEndIndex = Math.max(startIndex, endIndex);
  const selectedLines = lines.slice(
    normalizedStartIndex,
    normalizedEndIndex + 1,
  );
  const oldRange = getDiffRange(selectedLines, "oldLineNumber");
  const newRange = getDiffRange(selectedLines, "newLineNumber");

  return {
    id: input.id,
    filePath: input.filePath,
    startIndex: normalizedStartIndex,
    endIndex: normalizedEndIndex,
    rangeLabel: formatDiffReviewRangeLabel(selectedLines),
    text: input.text.trim(),
    anchor: buildReviewCommentAnchor(selectedLines),
    diff: [
      `@@ -${oldRange.start},${oldRange.count} +${newRange.start},${newRange.count} @@`,
      ...selectedLines.map(
        (line) => `${getDiffChangeMarker(line.change)}${line.content}`,
      ),
    ].join("\n"),
  };
}
