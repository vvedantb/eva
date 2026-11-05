import { stripBlock, upsertBlockAboveFooter } from "./prBodyBlocks";

/** Markers that delimit the generated block inside a PR body. Everything
 * outside them (Task / Change Requests / Summary sections and the Eva footer)
 * is owned by `prBody.ts`; everything inside is rewritten on every push. */
export const PR_DESCRIPTION_START = "<!-- eva-pr-description -->";
export const PR_DESCRIPTION_END = "<!-- /eva-pr-description -->";

/** Longest generated block we will accept — anything beyond this is a wall of
 * prose, which is exactly what the sectioned format exists to avoid. */
const MAX_DESCRIPTION_CHARS = 6_000;

/** First line of every generated block, from the `pr-writing` skill: it tells
 * the reviewer how much a human is behind the change. Written by code, not the
 * model, so it never drifts. The block is written when the work is offered for
 * review, which is before any human has reviewed it. */
export const PR_AUTHORSHIP_LINE =
  "> Written by an AI agent in Eva. No human has reviewed it yet.";

/**
 * Builds the prompt for the reviewer-facing PR description. The sections match
 * `.github/pull_request_template.md` (Why, Scope, Verification, Tradeoffs,
 * Blast radius, ELI5) so generated and hand-written PRs read the same way.
 * Order and honesty rules follow the `pr-writing` skill
 * (`.agents/skills/pr-writing`), cut down to what a diff-only call can do: it
 * has no tools, so it cannot capture evidence and must say what is unchecked.
 *
 * Scope leads on visible changes the Intent did not ask for. This is
 * the only such check a quick task **run** gets: a run stamps no turn diff
 * (`appendTurnCheckpoint` bails on `RUN_ID`), so the scope check never judges
 * it and no chip is ever drawn — and asking the run's own summary to confess
 * would fight its 3-5 bullet cap and rely on the same agent noticing what it
 * did. This reader has the whole diff and the task description side by side,
 * which is how an unrequested trophy icon reached production unnoticed.
 */
export function buildPrDescriptionPrompt(params: {
  prTitle: string;
  context: string;
  diffText: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  truncated: boolean;
}): string {
  const truncatedNote = params.truncated
    ? " (diff truncated — describe only what you can see)"
    : "";
  const context =
    params.context.trim().length > 0
      ? `\n## Intent (from Eva)\n${params.context.trim()}\n`
      : "";

  return `You write pull request descriptions for code reviewers. Reviewers know the codebase; they want the shape of the change, not a narration of the diff.

PR: ${params.prTitle}
Stats: +${params.additions} -${params.deletions} across ${params.changedFiles} files${truncatedNote}
${context}
## Output format

Write GitHub-flavoured markdown with these sections, in this order. Most reviewers stop early, so what matters comes first. Drop Tradeoffs when there are none.

### Why
The problem: what was wrong or missing, for whom, and how it showed up. Then why this approach fits. One short paragraph. Use real numbers only when the Intent or diff gives them.

### Scope
Bullets, in this order:
1. **Visible changes the Intent did not ask for**, when the diff has any: a swapped or resized icon, a changed colour or shade, reworded copy or labels, a control that moved or appeared. Name what changed and where — "Awarded banner icon: medal → trophy, not part of the stated task." One bullet each, up to three. Lead with these: they are what reaches production unreviewed, because a one-line icon swap disappears inside a larger diff.
2. Then the facts of the change: real symbols, paths and user-facing routes. Name both sides of a rename. State what is in and out when the boundary matters.
Judge (1) against the Intent above; when no Intent is given, skip (1) rather than guessing at what was asked for.

### Verification
Two parts:
- **Checked:** what the diff shows was checked: tests added or changed, and what they assert. A new API or helper: the call a user would write, when the diff shows it. If the diff contains no tests or checks, write "Not verified in this diff."
- **Not checked:** what a reviewer must check by hand, from the evidence this kind of change needs. UI: before and after screenshots at the same viewport. Bug fix: the input and result before and after. Performance: measured numbers on both sides. CLI or build: the real command output before and after.
Never claim a check ran that the diff does not show. You cannot see screenshots, logs or test runs, so never describe one.

### Tradeoffs
Real choices only: what was picked over what, and why. Omit the section entirely when there are none.

### Blast radius
Who and what the change touches, and why it is safe or risky. Name callers, data or schema it affects.

### ELI5
Two or three plain sentences that someone outside the project would follow. No file paths or identifiers.

## Rules
- Only use file paths, identifiers, routes and props that appear in the diff. Never invent names, numbers or results.
- Plain, direct sentences. No filler, no praise, no "this PR".
- Do not repeat the diff line by line.
- No headings other than the six above. No "Summary" or "Test plan". No preamble and no closing remarks.
- Do not write an authorship line or a "Generated with" footer. Eva adds the authorship line.
- Output only the markdown. Do not wrap the whole answer in a code fence.

## Diff
${params.diffText}`;
}

/** Strips a whole-answer code fence the model sometimes adds, bounds the
 * length so a runaway answer cannot flood the PR body, and puts the authorship
 * line first. Returns "" for an empty answer so the caller can skip the write. */
export function cleanPrDescription(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```[a-z]*\n([\s\S]*?)\n```$/);
  if (fence?.[1] !== undefined) {
    text = fence[1].trim();
  }
  if (text.length === 0) return "";
  if (text.length > MAX_DESCRIPTION_CHARS) {
    text = `${text.slice(0, MAX_DESCRIPTION_CHARS).trimEnd()}\n\n_Description truncated._`;
  }
  return `${PR_AUTHORSHIP_LINE}\n\n${text}`;
}

/** Returns the body with the generated block removed, so the static sections
 * can be handed back to the model as intent without the previous answer. */
export function stripPrDescription(body: string): string {
  return stripBlock(body, PR_DESCRIPTION_START, PR_DESCRIPTION_END);
}

/**
 * Inserts or replaces the generated block in a PR body. An existing block is
 * rewritten in place; otherwise the block goes just above the Eva footer so
 * the static sections stay on top and the footer stays last.
 */
export function insertPrDescription(body: string, description: string): string {
  return upsertBlockAboveFooter(
    body,
    PR_DESCRIPTION_START,
    PR_DESCRIPTION_END,
    description,
  );
}
