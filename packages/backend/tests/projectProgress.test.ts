import { describe, expect, test } from "bun:test";
import { bucketProjectProgress } from "@eva/shared/projectProgress";

const DAY = 24 * 60 * 60 * 1000;

describe("bucketProjectProgress", () => {
  test("puts shipped and archived tasks on their local day and counts open tasks at each day's end", () => {
    const tz = -120;
    const todayStart = Date.UTC(2026, 10, 26) - 2 * 60 * 60 * 1000;
    const now = todayStart + 10 * 60 * 60 * 1000;
    const progress = bucketProjectProgress(
      [
        { id: "a", createdAt: todayStart - 5 * DAY, shippedAt: todayStart - 30 * 60 * 1000, closedAt: todayStart - 30 * 60 * 1000 },
        { id: "b", createdAt: todayStart - 3 * DAY, closedAt: todayStart + 60 * 60 * 1000 },
        { id: "c", createdAt: todayStart - DAY + 1000 },
        { id: "d", createdAt: todayStart - 60 * DAY, closedAt: todayStart - 40 * DAY },
      ],
      now,
      tz,
      30,
    );
    const [yesterday, today] = progress.days.slice(-2);
    expect(today?.start).toBe(todayStart);
    expect(yesterday?.shipped).toEqual(["a"]);
    expect(today?.archived).toEqual(["b"]);
    expect(yesterday?.open).toBe(2);
    expect(today?.open).toBe(1);
    expect(progress.totals).toEqual({ shipped: 1, archived: 1, open: 1 });
    expect(progress.days).toHaveLength(30);
  });
});
