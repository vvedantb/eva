/**
 * Fields only an open entity's chat or sandbox panel reads, never a list row.
 * `backgroundAgents` alone was 44% of an average task row in production
 * (850 of 1,921 bytes, 400 newest tasks, 10 November 2026), and list queries
 * resend every row on any change in the repo.
 */
type PanelOnlyKey = "backgroundAgents" | "terminalPanes" | "terminalHistoryTail";

/**
 * A list row without its panel-only fields. Takes a document (query results)
 * or a validator field map (return validators), so both drop the same keys.
 */
export function listRow<Row extends Partial<Record<PanelOnlyKey, object | string>>>(
  row: Row,
): Omit<Row, PanelOnlyKey> {
  const {
    backgroundAgents: _backgroundAgents,
    terminalPanes: _terminalPanes,
    terminalHistoryTail: _terminalHistoryTail,
    ...rest
  } = row;
  return rest;
}
