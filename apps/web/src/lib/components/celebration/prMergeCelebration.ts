interface PrStateRow {
  _id: string;
  state: string;
}

/**
 * True when a PR that was known and not merged in `before` is merged in
 * `after`. A PR first seen already merged does not count: opening an old chat
 * must not celebrate history.
 */
export function hasNewlyMergedPr(
  before: ReadonlyArray<PrStateRow>,
  after: ReadonlyArray<PrStateRow>,
): boolean {
  const previous = new Map(before.map((row) => [row._id, row.state]));
  return after.some((row) => {
    const was = previous.get(row._id);
    return row.state === "merged" && was !== undefined && was !== "merged";
  });
}
