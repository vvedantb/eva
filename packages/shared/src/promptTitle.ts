import { tokenizedToDisplayText } from "./mentionText";

/** The longest fallback title, before the word-boundary cut. */
const PROMPT_TITLE_MAX = 60;

/** One markdown line as plain text: no block markers, emphasis, code ticks or link targets. */
function plainMarkdownLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A task's or project's title from its prompt, until the generated one
 * replaces it: the first non-empty line, mention and skill tokens as their
 * `@Label` / `/Label` text, markdown stripped, cut to about 60 characters on
 * a word boundary. Empty when the prompt has no text.
 */
export function titleFromPrompt(prompt: string): string {
  const line =
    tokenizedToDisplayText(prompt)
      .split("\n")
      .map(plainMarkdownLine)
      .find((candidate) => candidate.length > 0) ?? "";
  if (line.length <= PROMPT_TITLE_MAX) return line;
  const cut = line.slice(0, PROMPT_TITLE_MAX + 1);
  const space = cut.lastIndexOf(" ");
  // A first word longer than half the limit is cut mid-word rather than left alone.
  const end = space > PROMPT_TITLE_MAX / 2 ? space : PROMPT_TITLE_MAX;
  return `${cut.slice(0, end).replace(/[\s.,;:!?-]+$/, "")}…`;
}
