import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const columnSource = readFileSync(join(here, "KanbanColumn.tsx"), "utf8");
const boardSource = readFileSync(join(here, "KanbanBoard.tsx"), "utf8");

/**
 * The column width class, read out of the source rather than imported —
 * `KanbanColumn.tsx` pulls in `@eva/ui`, and this only needs the string.
 */
const widthClass = (() => {
  const match = columnSource.match(
    /export const KANBAN_COLUMN_WIDTH_CLASS =\s*"([^"]+)"/,
  );
  expect(
    match,
    "KANBAN_COLUMN_WIDTH_CLASS moved or was renamed",
  ).not.toBeNull();
  return match === null ? "" : match[1];
})();

/** The `sm:gap-3` gutter the basis maths subtracts, in rem. */
const GUTTER_REM = 0.75;

/**
 * A column's basis is `calc((100% - <gutters>) / <n>)` per breakpoint. Getting
 * the gutter total wrong overflows the row by a few pixels at that breakpoint,
 * which shows up as a stray horizontal scrollbar rather than an obvious break —
 * so the arithmetic is worth pinning down.
 */
describe("KANBAN_COLUMN_WIDTH_CLASS", () => {
  const steps = [
    ...widthClass.matchAll(/calc\(\(100%-([\d.]+)rem\)\/(\d+)\)/g),
  ].map(([, gutters, columns]) => ({
    gutters: Number(gutters),
    columns: Number(columns),
  }));

  it("subtracts one gutter less than the column count at every breakpoint", () => {
    expect(steps.length, "no calc() basis steps found").toBeGreaterThan(0);
    for (const { gutters, columns } of steps) {
      expect(
        gutters,
        `a ${columns}-column step must subtract ${columns - 1} gutters`,
      ).toBeCloseTo((columns - 1) * GUTTER_REM, 5);
    }
  });

  it("steps through 2, 3, 4 and 5 columns as the viewport widens", () => {
    expect(steps.map((step) => step.columns)).toEqual([2, 3, 4, 5]);
  });

  /**
   * `flex-[1_0_...]` — grow so a board with fewer columns than the breakpoint
   * allows still fills the width, shrink 0 so extra statuses scroll instead of
   * squashing every column below readable.
   */
  it("lets columns grow but never shrink", () => {
    const bases = [...widthClass.matchAll(/flex-\[(\d)_(\d)_/g)];
    expect(bases.length).toBe(steps.length);
    for (const [, grow, shrink] of bases) {
      expect(grow).toBe("1");
      expect(shrink).toBe("0");
    }
  });

  /** Mobile shows one column plus a peek of the next, to signal the scroll. */
  it("leaves a peek of the next column on mobile", () => {
    const peek = widthClass.match(/min-w-\[(\d+)vw\]/);
    expect(peek, "the mobile peek width is gone").not.toBeNull();
    expect(Number(peek === null ? 100 : peek[1])).toBeLessThan(100);
    expect(widthClass, "the peek must not survive past mobile").toContain(
      "sm:min-w-0",
    );
  });

  /** The basis maths is only right while the row's gutter really is 0.75rem. */
  it("matches the gutter the board actually renders", () => {
    expect(boardSource, "the width maths assumes sm:gap-3").toContain(
      "sm:gap-3",
    );
    expect(GUTTER_REM).toBe(0.75);
  });
});
