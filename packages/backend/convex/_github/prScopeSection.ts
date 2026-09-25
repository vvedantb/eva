/**
 * The scope-check summary as it appears in a pull request body.
 *
 * The chat chip only helps someone reading the chat. The trophy icon that
 * started all this reached production through a PR a person opened by copying
 * Eva's files onto a clean branch — no Eva chat, no chip, nothing for the
 * reviewer to see. So the verdict has to travel to the PR, keyed by the commits
 * it describes rather than by the session that produced them.
 *
 * Runtime-free so the markdown and the ordering are testable without a
 * deployment or a GitHub call.
 */

import { upsertBlockAboveFooter } from "./prBodyBlocks";

export const SCOPE_SECTION_START = "<!-- eva-scope-check -->";
export const SCOPE_SECTION_END = "<!-- /eva-scope-check -->";

/** Past this the section is a wall nobody reads; the rest stay in the chat. */
export const MAX_SECTION_ROWS = 15;

/** One flagged change, already reduced to what a reviewer needs to see. */
export type ScopeSectionRow = {
  /** Plain-English headline, e.g. `Icon changed (IconAward → IconTrophy)`. */
  summary: string;
  /** Plain-English screen name, e.g. `Awarded panel`. */
  surface: string;
  /** Repo-relative path, for the reviewer who wants the diff. */
  file: string;
  /** True when the agent's reply never told the user about this change. */
  unreported: boolean;
};

/** Unreported first, then by screen, so the riskiest rows lead. */
export function orderRows(rows: readonly ScopeSectionRow[]): ScopeSectionRow[] {
  return rows.toSorted((left, right) => {
    if (left.unreported !== right.unreported) return left.unreported ? -1 : 1;
    return left.surface.localeCompare(right.surface);
  });
}

/**
 * The markdown block, or "" when there is nothing to report — an empty section
 * is removed from the body rather than written as a reassuring heading, so the
 * section's presence is itself the signal.
 */
export function buildScopeSection(rows: readonly ScopeSectionRow[]): string {
  if (rows.length === 0) return "";
  const ordered = orderRows(rows);
  const shown = ordered.slice(0, MAX_SECTION_ROWS);
  const unreported = ordered.filter((row) => row.unreported).length;

  const lead =
    unreported > 0
      ? `${unreported === 1 ? "**1 change** was" : `**${unreported} changes** were`} made without being asked for **and** without being mentioned in the reply. Check ${unreported === 1 ? "it" : "them"} before merging.`
      : `${ordered.length === 1 ? "**1 change** was" : `**${ordered.length} changes** were`} made without being asked for. The agent did report ${ordered.length === 1 ? "it" : "them"}.`;

  const lines = shown.map((row) => {
    const flag = row.unreported ? " — **not mentioned in the reply**" : "";
    return `- ${row.summary} — ${row.surface} (\`${row.file}\`)${flag}`;
  });
  const omitted = ordered.length - shown.length;
  if (omitted > 0) {
    lines.push(`- …and ${omitted} more, listed in the Eva chat.`);
  }

  return [
    "## Changes nobody asked for",
    "",
    lead,
    "",
    ...lines,
    "",
    "<sub>Flagged automatically by Eva. A change here is not necessarily wrong — it is a change the prompt did not ask for, which nobody has reviewed as a decision.</sub>",
  ].join("\n");
}

/** Writes (or clears) the section in a PR body, leaving every other block alone. */
export function upsertScopeSection(
  body: string,
  rows: readonly ScopeSectionRow[],
): string {
  return upsertBlockAboveFooter(
    body,
    SCOPE_SECTION_START,
    SCOPE_SECTION_END,
    buildScopeSection(rows),
  );
}
