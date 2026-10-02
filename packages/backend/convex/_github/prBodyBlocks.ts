/**
 * Marker-delimited blocks inside a pull request body.
 *
 * Three writers share one body: `prBody.ts` owns the static sections (Task,
 * Change Requests, Related PRs) and the Eva footer, while generated blocks —
 * the reviewer description and the scope-check summary — are rewritten on every
 * push. Each generated block sits between its own comment markers, so rewriting
 * one never disturbs the other and a hand-edited body keeps its own prose.
 *
 * Extracted from `prDescriptionPrompt.ts` when the scope-check section needed
 * the same splice; both now share one implementation of "where does the footer
 * start" rather than each guessing.
 */

const FOOTER_SEPARATOR = "\n---\n";

/**
 * Index of the `---` line that opens the Eva footer, or -1. The rule is the
 * last line that is exactly `---`, which may be the very first line when the
 * body has no static sections.
 */
export function findFooterStart(body: string): number {
  const at = body.lastIndexOf(FOOTER_SEPARATOR);
  if (at !== -1) return at + 1;
  return body.startsWith(FOOTER_SEPARATOR.slice(1)) ? 0 : -1;
}

/** Removes a marker block, leaving the rest of the body joined cleanly. */
export function stripBlock(body: string, start: string, end: string): string {
  const from = body.indexOf(start);
  const to = body.indexOf(end);
  if (from === -1 || to === -1 || to < from) return body;
  const before = body.slice(0, from).trimEnd();
  const after = body.slice(to + end.length).trimStart();
  return after.length > 0 ? `${before}\n\n${after}` : before;
}

/**
 * Inserts or replaces a marker block. An existing block is rewritten in place;
 * otherwise the block goes just above the Eva footer, so the static sections
 * stay on top and the footer stays last. Empty content removes the block —
 * a section with nothing to say should leave no trace.
 */
export function upsertBlockAboveFooter(
  body: string,
  start: string,
  end: string,
  content: string,
): string {
  const stripped = stripBlock(body, start, end);
  if (content.trim().length === 0) return stripped;
  const block = `${start}\n${content.trim()}\n${end}`;
  const footerAt = findFooterStart(stripped);
  if (footerAt === -1) {
    return stripped.trim().length > 0
      ? `${stripped.trimEnd()}\n\n${block}`
      : block;
  }
  const head = stripped.slice(0, footerAt).trimEnd();
  const footer = stripped.slice(footerAt);
  return head.length > 0
    ? `${head}\n\n${block}\n${footer}`
    : `${block}\n${footer}`;
}
