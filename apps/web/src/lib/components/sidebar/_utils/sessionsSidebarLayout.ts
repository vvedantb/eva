/**
 * One grid for the Sessions sidebar: app headers, session rows and Show more
 * share a left edge and a leading column, so logos, status marks and titles
 * line up down the list. Full class strings, so Tailwind sees them.
 */

/** Horizontal row padding (10px), shared by every row and header. */
export const SESSIONS_ROW_X = "px-2.5";

/** Leading column: the width of the app logo (18px); marks centre in it. */
export const SESSIONS_LEADING_SLOT =
  "flex w-[18px] shrink-0 items-center justify-center";

/** Text start after the leading column: 18px slot + `gap-2`. */
export const SESSIONS_TEXT_INDENT = "pl-[26px]";
