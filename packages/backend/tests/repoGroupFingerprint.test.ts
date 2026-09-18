import { expect, test } from "vitest";
import { computeRepoGroupFingerprint } from "../convex/_repoGroups/snapshot";

const base = {
  primarySeededSnapshotName: "snap_primary_1",
  members: [
    { repoId: "r2", defaultBaseBranch: "main" },
    { repoId: "r1", defaultBaseBranch: "develop" },
  ],
  installDependencies: true,
};

test("is a stable hex string", () => {
  const fingerprint = computeRepoGroupFingerprint(base);
  expect(fingerprint).toMatch(/^[0-9a-f]+$/);
  expect(computeRepoGroupFingerprint(base)).toBe(fingerprint);
});

test("is independent of member order", () => {
  const reordered = { ...base, members: [...base.members].reverse() };
  expect(computeRepoGroupFingerprint(reordered)).toBe(
    computeRepoGroupFingerprint(base),
  );
});

test("changes when the primary's seeded snapshot changes", () => {
  const changed = { ...base, primarySeededSnapshotName: "snap_primary_2" };
  expect(computeRepoGroupFingerprint(changed)).not.toBe(
    computeRepoGroupFingerprint(base),
  );
});

test("changes when installDependencies changes", () => {
  const changed = { ...base, installDependencies: false };
  expect(computeRepoGroupFingerprint(changed)).not.toBe(
    computeRepoGroupFingerprint(base),
  );
});

test("changes when a member's branch changes", () => {
  const changed = {
    ...base,
    members: [
      { repoId: "r2", defaultBaseBranch: "main" },
      { repoId: "r1", defaultBaseBranch: "release" },
    ],
  };
  expect(computeRepoGroupFingerprint(changed)).not.toBe(
    computeRepoGroupFingerprint(base),
  );
});

test("changes when a member repo is added or removed", () => {
  const withExtra = {
    ...base,
    members: [...base.members, { repoId: "r3", defaultBaseBranch: "main" }],
  };
  expect(computeRepoGroupFingerprint(withExtra)).not.toBe(
    computeRepoGroupFingerprint(base),
  );
});

test("changes when the primary snapshot is null vs a real snapshot", () => {
  const withoutPrimary = { ...base, primarySeededSnapshotName: null };
  expect(computeRepoGroupFingerprint(withoutPrimary)).not.toBe(
    computeRepoGroupFingerprint(base),
  );
});
