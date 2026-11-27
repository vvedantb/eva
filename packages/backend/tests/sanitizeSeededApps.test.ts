import { expect, test } from "bun:test";
import { sanitizeSeededApps } from "../convex/_repoSnapshots/sanitizeSeededApps";

test("sanitizeSeededApps strips legacy warmupStatus from seeded app rows", () => {
  const sanitized = sanitizeSeededApps([
    {
      repoId: "mh7repo000000000000000001",
      seededSnapshotName: "snap_abc",
      app: "apps/web",
      status: "seeded",
      warmupStatus: "done",
    },
  ]);

  expect(sanitized).toEqual([
    {
      repoId: "mh7repo000000000000000001",
      seededSnapshotName: "snap_abc",
      app: "apps/web",
      status: "seeded",
    },
  ]);
  expect(sanitized?.[0]).not.toHaveProperty("warmupStatus");
});

test("sanitizeSeededApps returns undefined for missing seededApps", () => {
  expect(sanitizeSeededApps(undefined)).toBeUndefined();
});
