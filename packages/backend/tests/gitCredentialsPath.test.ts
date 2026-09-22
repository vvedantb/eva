import { expect, test } from "vitest";
import {
  allowedInstallationIds,
  isInstallationAllowed,
  parseRepoPath,
} from "../convex/_sandbox_runtime/gitCredentialsPath";

test("parseRepoPath extracts owner and name from a plain path", () => {
  expect(parseRepoPath("owner/name")).toEqual({ owner: "owner", name: "name" });
});

test("parseRepoPath strips a trailing .git suffix", () => {
  expect(parseRepoPath("owner/name.git")).toEqual({
    owner: "owner",
    name: "name",
  });
});

test("parseRepoPath tolerates a leading slash", () => {
  expect(parseRepoPath("/owner/name")).toEqual({ owner: "owner", name: "name" });
});

test("parseRepoPath returns null for a path with no repo name", () => {
  expect(parseRepoPath("owner")).toBeNull();
  expect(parseRepoPath("")).toBeNull();
  expect(parseRepoPath("///")).toBeNull();
});

test("allowedInstallationIds falls back to the primary when installationIds is absent", () => {
  expect(allowedInstallationIds({ installationId: 1 })).toEqual([1]);
});

test("allowedInstallationIds falls back to the primary when installationIds is empty", () => {
  expect(
    allowedInstallationIds({ installationId: 1, installationIds: [] }),
  ).toEqual([1]);
});

test("allowedInstallationIds returns the full list when present", () => {
  expect(
    allowedInstallationIds({ installationId: 1, installationIds: [1, 2] }),
  ).toEqual([1, 2]);
});

test("isInstallationAllowed accepts the primary on a legacy row", () => {
  expect(isInstallationAllowed(1, { installationId: 1 })).toBe(true);
  expect(isInstallationAllowed(2, { installationId: 1 })).toBe(false);
});

test("isInstallationAllowed accepts any installation in the multi-repo allow-list", () => {
  const credential = { installationId: 1, installationIds: [1, 2] };
  expect(isInstallationAllowed(1, credential)).toBe(true);
  expect(isInstallationAllowed(2, credential)).toBe(true);
  expect(isInstallationAllowed(3, credential)).toBe(false);
});
