import { tokenizedToDisplayText } from "./mentionText";

/** Words of a thread's root the "Eva is replying in a thread" link shows. */
const THREAD_PREVIEW_WORDS = 6;

/**
 * The first words of a thread's root message as plain text, with "…" when
 * cut: mention tokens read as `@Name`, and markdown `*`, code ticks and
 * line markers (`#`, `>`, `-`) drop out.
 */
export function threadRootPreview(content: string): string {
  const words = tokenizedToDisplayText(content)
    .replace(/^[\s#>*-]+/gm, "")
    .replace(/[*`]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const shown = words.slice(0, THREAD_PREVIEW_WORDS).join(" ");
  return words.length > THREAD_PREVIEW_WORDS ? `${shown}…` : shown;
}
