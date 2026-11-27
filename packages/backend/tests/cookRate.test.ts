import { expect, test } from "bun:test";

function cookRatePercent(done: number, cancelled: number): number {
  const tasksRan = done + cancelled;
  return tasksRan > 0 ? Math.round((done / tasksRan) * 100) : 0;
}

test("cook rate is done over done plus cancelled", () => {
  expect(cookRatePercent(3, 1)).toBe(75);
  expect(cookRatePercent(0, 4)).toBe(0);
  expect(cookRatePercent(5, 0)).toBe(100);
  expect(cookRatePercent(0, 0)).toBe(0);
});
