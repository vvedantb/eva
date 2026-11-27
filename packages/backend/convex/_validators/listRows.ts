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
