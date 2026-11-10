import type { Doc } from "../_generated/dataModel";

/**
 * Fields only an open entity's chat or sandbox panel reads, never a list row.
 * `backgroundAgents` alone was 44% of an average task row in production
 * (850 of 1,921 bytes, 400 newest tasks, 10 November 2026), and list queries
 * resend every row on any change in the repo.
 */
type PanelOnlyFields = Pick<
  Doc<"agentTasks">,
  "backgroundAgents" | "terminalPanes" | "terminalHistoryTail"
>;

/** A list row: the document without its panel-only fields. */
export function listRow<Row extends Partial<PanelOnlyFields>>(
  row: Row,
): Omit<Row, keyof PanelOnlyFields> {
  const {
    backgroundAgents: _backgroundAgents,
    terminalPanes: _terminalPanes,
    terminalHistoryTail: _terminalHistoryTail,
    ...rest
  } = row;
  return rest;
}
