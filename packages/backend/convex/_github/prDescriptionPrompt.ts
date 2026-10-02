import { stripBlock, upsertBlockAboveFooter } from "./prBodyBlocks";

/** Markers that delimit the generated block inside a PR body. Everything
 * outside them (Task / Change Requests / Summary sections and the Eva footer)
 * is owned by `prBody.ts`; everything inside is rewritten on every push. */
export const PR_DESCRIPTION_START = "<!-- eva-pr-description -->";
export const PR_DESCRIPTION_END = "<!-- /eva-pr-description -->";

/** Longest generated block we will accept — anything beyond this is a wall of
 * prose, which is exactly what the visual format exists to avoid. */
const MAX_DESCRIPTION_CHARS = 6_000;

/**
 * Builds the prompt for the reviewer-facing PR description. The output is
 * deliberately "show-me" shaped: one short paragraph, one code-shape visual
 * that fits the change (file tree, call-tree diff, signature block or
 * component-tree diff), and a short list of review notes. The point is a body a
 * reviewer can scan in ten seconds before opening the diff.
 *
 * The review notes lead on visible changes the Intent did not ask for. This is
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

Write GitHub-flavoured markdown with exactly these sections, in this order:

### What changed
One or two sentences: what a reviewer needs to know, and why it was done. Name user-facing routes if any changed.

### Shape
ONE fenced code block that shows the shape of the change. Pick the smallest form that makes the point:
- Shallow file tree with one short comment per entry (\`\`\`text) — default for changes across several files.
- Call-tree or control-flow diff (\`\`\`diff, with +/- on the changed lines) — when the point is a changed flow.
- Types and signatures (\`\`\`ts) — when a schema, API or function contract changed.
- Component tree diff (\`\`\`diff) — when UI structure changed.
Only use file paths, identifiers, routes and props that appear in the diff. Never invent names. Keep it under 25 lines.

### Review notes
Bullets a reviewer needs, in this order:
1. **Visible changes the Intent did not ask for**, when the diff has any: a swapped or resized icon, a changed colour or shade, reworded copy or labels, a control that moved or appeared. Name what changed and where — "Awarded banner icon: medal → trophy, not part of the stated task." One bullet each, up to three. Lead with these: they are what reaches production unreviewed, because a one-line icon swap disappears inside a larger diff.
2. Then up to three more: risks, edge cases, behaviour that is easy to miss, or where to look first.
Judge (1) against the Intent above; when no Intent is given, skip (1) rather than guessing at what was asked for. Omit the whole section only when both are empty.

## Rules
- Plain, direct sentences. No filler, no praise, no "this PR".
- Do not repeat the diff line by line and do not list every file in prose — that is what the Shape block is for.
- No headings other than the three above. No preamble and no closing remarks.
- Output only the markdown. Do not wrap the whole answer in a code fence.

## Diff
${params.diffText}`;
}

/** Strips a whole-answer code fence the model sometimes adds, then bounds the
 * length so a runaway answer cannot flood the PR body. */
export function cleanPrDescription(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```[a-z]*\n([\s\S]*?)\n```$/);
  if (fence?.[1] !== undefined) {
    text = fence[1].trim();
  }
  if (text.length > MAX_DESCRIPTION_CHARS) {
    text = `${text.slice(0, MAX_DESCRIPTION_CHARS).trimEnd()}\n\n_Description truncated._`;
  }
  return text;
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
