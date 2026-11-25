import { expect, test } from "bun:test";
import {
  EPHEMERAL_SNAPSHOT_TTL_MS,
  KEEP_LAST_SNAPSHOTS,
  SNAPSHOT_TTL_MS,
  vercelSnapshotCreateOptions,
} from "../convex/_sandbox/vercelSnapshotOptions";

test("vercelSnapshotCreateOptions always sets an explicit TTL", () => {
  // Creating from a seed snap with expiration:0 otherwise inherits never-expire.
  expect(vercelSnapshotCreateOptions(true).snapshotExpiration).toBe(
    SNAPSHOT_TTL_MS,
  );
  expect(vercelSnapshotCreateOptions(false).snapshotExpiration).toBe(
    EPHEMERAL_SNAPSHOT_TTL_MS,
  );
  expect(vercelSnapshotCreateOptions(false).snapshotExpiration).toBeGreaterThan(
    0,
  );
});

test("vercelSnapshotCreateOptions keeps only one snap on persistent sandboxes", () => {
  expect(vercelSnapshotCreateOptions(true).keepLastSnapshots).toEqual(
    KEEP_LAST_SNAPSHOTS,
  );
  expect(KEEP_LAST_SNAPSHOTS).toEqual({
    count: 1,
    deleteEvicted: true,
    expiration: SNAPSHOT_TTL_MS,
  });
});

test("vercelSnapshotCreateOptions omits keepLastSnapshots for ephemeral", () => {
  expect(vercelSnapshotCreateOptions(false).keepLastSnapshots).toBeUndefined();
});
