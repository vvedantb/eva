/** Lines kept in an entity's `terminalHistoryTail` (console history synced to Convex). */
const TERMINAL_HISTORY_TAIL_LINES = 500;
/** Char cap on the same tail, so one huge line cannot inflate the doc. */
const TERMINAL_HISTORY_TAIL_MAX_CHARS = 100_000;

/**
 * Last `TERMINAL_HISTORY_TAIL_LINES` newline-delimited lines of `text`, then
 * capped at `TERMINAL_HISTORY_TAIL_MAX_CHARS`. The client trims before it
 * syncs; the server trims again so a buggy client cannot inflate entity docs.
 */
export function terminalHistoryTail(text: string): string {
  if (text.length === 0) return "";
  let linesFound = 0;
  let sliceFrom = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "\n") {
      linesFound += 1;
      if (linesFound === TERMINAL_HISTORY_TAIL_LINES) {
        sliceFrom = i + 1;
        break;
      }
    }
  }
  const byLines = text.slice(sliceFrom);
  return byLines.length > TERMINAL_HISTORY_TAIL_MAX_CHARS
    ? byLines.slice(-TERMINAL_HISTORY_TAIL_MAX_CHARS)
    : byLines;
}
