import { z } from "zod";

// The `<review_comment>` blocks a diff review appends to a prompt
// (`appendReviewCommentsToPrompt` on the web), read back out of a message:
// both apps show a queued or sent prompt without them.

export type ReviewCommentSide = "LEFT" | "RIGHT";

/**
 * Where a comment attaches in GitHub's review model: a line number on one side
 * of the diff (`LEFT` is the base file, `RIGHT` the head file), plus a start
 * line for a multi-line comment.
 */
export interface ReviewCommentAnchor {
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
