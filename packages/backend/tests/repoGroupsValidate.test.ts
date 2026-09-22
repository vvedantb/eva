import { expect, test } from "vitest";
import {
  validateRepoGroupMembers,
  type RepoGroupMember,
} from "../convex/_repoGroups/validate";

const eva: RepoGroupMember = { id: "r1", owner: "vvedantb", name: "eva" };
const carepulse: RepoGroupMember = {
  id: "r2",
  owner: "evalucom",
  name: "carepulse-ts",
};

test("accepts a primary plus distinct linked repos", () => {
  expect(validateRepoGroupMembers(eva, [carepulse])).toBeNull();
  expect(
    validateRepoGroupMembers(eva, [
      carepulse,
      { id: "r3", owner: "evalucom", name: "pulse-docs" },
    ]),
  ).toBeNull();
});

test("requires at least one linked repo", () => {
  expect(validateRepoGroupMembers(eva, [])).toBe(
    "Select at least one linked repository",
  );
});

test("rejects the primary appearing as a linked repo", () => {
  expect(validateRepoGroupMembers(eva, [eva])).toBe(
    "The primary repository cannot also be a linked repository",
  );
});

test("rejects a duplicated linked repo", () => {
  expect(validateRepoGroupMembers(eva, [carepulse, carepulse])).toBe(
    "Repository evalucom/carepulse-ts is listed twice",
  );
});

test("rejects two rows of the same repository (monorepo sibling apps)", () => {
  // Sibling app rows share owner/name; a linked repo is the whole checkout.
  const sibling: RepoGroupMember = {
    id: "r3",
    owner: "evalucom",
    name: "carepulse-ts",
  };
  expect(validateRepoGroupMembers(eva, [carepulse, sibling])).toContain(
    "already in this group",
  );
});

test("rejects a folder-name collision across owners", () => {
  const otherEva: RepoGroupMember = { id: "r9", owner: "acme", name: "eva" };
  expect(validateRepoGroupMembers(eva, [otherEva])).toContain(
    'both named "eva"',
  );
  expect(
    validateRepoGroupMembers(carepulse, [
      eva,
      { id: "r9", owner: "acme", name: "eva" },
    ]),
  ).toContain('both named "eva"');
});
