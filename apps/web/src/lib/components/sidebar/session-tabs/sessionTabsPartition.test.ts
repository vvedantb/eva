import { describe, expect, test } from "vitest";
import { partitionSessionsForChromeTabs } from "./sessionTabsPartition";

type Row = {
  id: string;
  archived?: boolean;
  prState?: "draft" | "open" | "merged" | "closed";
};

describe("partitionSessionsForChromeTabs", () => {
  const draft: Row = { id: "draft", prState: "draft" };
  const open: Row = { id: "open", prState: "open" };
  const noPr: Row = { id: "no-pr" };
  const merged: Row = { id: "merged", prState: "merged" };
  const closed: Row = { id: "closed", prState: "closed" };
  const manuallyArchived: Row = { id: "archived", archived: true };

  test("keeps every non-archived session active in input order", () => {
    const result = partitionSessionsForChromeTabs(
      [draft, merged, open, closed, noPr],
      [manuallyArchived],
    );
    expect(result.active.map((row) => row.id)).toEqual([
      "draft",
      "merged",
      "open",
      "closed",
      "no-pr",
    ]);
    expect(result.archivedMenu.map((row) => row.id)).toEqual(["archived"]);
  });

  test("does not duplicate manually archived rows from the non-archived query", () => {
    const result = partitionSessionsForChromeTabs(
      [manuallyArchived, open],
      [manuallyArchived],
    );
    expect(result.active.map((row) => row.id)).toEqual(["open"]);
    expect(result.archivedMenu.map((row) => row.id)).toEqual(["archived"]);
  });

  test("handles empty query pages", () => {
    expect(partitionSessionsForChromeTabs([], [])).toEqual({
      active: [],
      archivedMenu: [],
    });
  });
});
