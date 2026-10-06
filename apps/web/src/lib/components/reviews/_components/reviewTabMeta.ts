import type { ReviewTab } from "@/lib/search-params";

/**
 * The tab row, in one table: order and label. Every review surface renders from
 * this, so a tab cannot pick up a different name on the standalone page than it
 * has in a session.
 *
 * Three tabs, as t3code lays a pull request out. The labels are not all slugs:
 * Code keeps the `diffs` slug its nested layout routes hang off.
 */
export const REVIEW_TAB_ORDER: readonly ReviewTab[] = [
  "summary",
  "timeline",
  "diffs",
];

export const REVIEW_TAB_LABEL: Record<ReviewTab, string> = {
  summary: "Summary",
  timeline: "Timeline",
  diffs: "Code",
};
