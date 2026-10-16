import {
  fallbackRecapWalkthrough,
  parseRecapWalkthrough,
  type RecapWalkthroughStep,
} from "./walkthrough";

export interface PrRecapDiffStats {
  additions: number;
  deletions: number;
  changedFiles: number;
  truncated: boolean;
}

export interface PrRecapReviewerFeedback {
  anchorText?: string;
  content: string;
}

/** Sentinel separating the markdown recap from the walkthrough JSON in agent output. */
export const PR_RECAP_WALKTHROUGH_MARKER = "===EVA_RECAP_WALKTHROUGH===";

/**
 * Builds the Claude Code prompt for a PR recap. The agent returns TWO parts in
 * one response: a markdown recap (stored as the doc content and posted to
 * GitHub) and a JSON walkthrough the app renders natively, separated by the
 * PR_RECAP_WALKTHROUGH_MARKER line.
 */
export function buildPrRecapPrompt(params: {
  prTitle: string;
  prNumber: number;
  prUrl: string;
  headSha: string;
  diffText: string;
  diffStats: PrRecapDiffStats;
  reviewerFeedback?: PrRecapReviewerFeedback[];
}): string {
  const truncatedNote = params.diffStats.truncated
    ? " (diff truncated for size)"
    : "";

  const feedbackSection =
    params.reviewerFeedback && params.reviewerFeedback.length > 0
      ? `
## Reviewer feedback to address
Revise the recap to incorporate this feedback from reviewers on the previous version:

${params.reviewerFeedback
  .map((item) => {
    const anchor = item.anchorText ? `On "${item.anchorText}": ` : "";
    return `- ${anchor}${item.content}`;
  })
  .join("\n")}
`
      : "";

  return `You are generating a PR recap for code reviewers in TWO formats.

PR #${params.prNumber}: ${params.prTitle}
URL: ${params.prUrl}
Head SHA: ${params.headSha}
Stats: +${params.diffStats.additions} -${params.diffStats.deletions} across ${params.diffStats.changedFiles} files${truncatedNote}
${feedbackSection}
Produce your output as exactly two parts, in this order, separated by a line containing ONLY the marker ${PR_RECAP_WALKTHROUGH_MARKER}

## PART 1 — Markdown recap (before the marker)
A structured markdown recap with these sections:
## Summary
## Schema/API changes
## Before/After
## Risks
## Files touched

Focus on what changed and why it matters to reviewers.

## PART 2 — Walkthrough JSON (after the marker)
A guided tour of this PR as one JSON object. The app renders each step with the real diff of the files it names, so do not copy code into it.

Shape:
{"steps":[{"title":"...","summary":"...","files":["path/a.ts"],"lookClosely":"..."}]}

Rules:
- Order the steps the way a reviewer should read the change: the core idea first, then what builds on it, then tests and wiring. Group files by idea, not by directory.
- "title": a short phrase naming what the step changes.
- "summary": 1-4 sentences of markdown on what changed and why it matters.
- "files": exact changed paths from the diff headers below. Put each changed file in exactly one step. A step may have no files (an overview step).
- "lookClosely": include ONLY where the reviewer must make a call (a contract change, a risky migration, a behaviour change that is easy to miss). Omit it otherwise.
- Output valid JSON only: no comments, no trailing commas.

Output ONLY the markdown, then a line with the marker, then the JSON object. No preamble and no code fences.

## Diff
${params.diffText}`;
}

export type PrRecapParseFailure = "missing_marker" | "invalid_markdown";

export type ParsedPrRecap =
  | { ok: true; markdown: string; walkthrough: RecapWalkthroughStep[] }
  | { ok: false; reason: PrRecapParseFailure };

const MARKDOWN_HEADING = /^#{1,3}\s+\S/m;

/**
 * Splits raw agent output into the markdown recap and the walkthrough, holding
 * the walkthrough to `changedFiles` (see `parseRecapWalkthrough`). Output with
 * no marker or no markdown recap is rejected so the workflow can store an
 * error instead of a false "ready".
 */
export function parsePrRecapOutput(
  raw: string,
  changedFiles: readonly string[],
): ParsedPrRecap {
  const markerIndex = raw.indexOf(PR_RECAP_WALKTHROUGH_MARKER);
  if (markerIndex === -1) {
    return { ok: false, reason: "missing_marker" };
  }

  const markdown = raw.slice(0, markerIndex).trim();
  if (!looksLikeMarkdownRecap(markdown)) {
    return { ok: false, reason: "invalid_markdown" };
  }

  // Broken walkthrough JSON does not sink a good markdown recap: the reader
  // gets every file in one step instead (see `fallbackRecapWalkthrough`).
  const walkthrough =
    parseRecapWalkthrough(
      raw.slice(markerIndex + PR_RECAP_WALKTHROUGH_MARKER.length),
      changedFiles,
    ) ?? fallbackRecapWalkthrough(changedFiles);

  return { ok: true, markdown, walkthrough };
}

function looksLikeMarkdownRecap(markdown: string): boolean {
  return markdown.length >= 40 && MARKDOWN_HEADING.test(markdown);
}
