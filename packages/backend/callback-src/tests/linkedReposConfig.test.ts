import { describe, expect, test } from "vitest";
import { parseLinkedReposEnv, resolveAgentCwd } from "../linkedRepos.js";

describe("parseLinkedReposEnv", () => {
  const validRepo = {
    owner: "evalucom",
    name: "carepulse",
    path: "/tmp/workspace/carepulse",
    branchName: "eva/session-abc",
    baseBranch: "main",
  };

  test("parses a valid JSON array", () => {
    const raw = JSON.stringify([validRepo]);
    expect(parseLinkedReposEnv(raw)).toEqual([validRepo]);
  });

  test("parses multiple repos, preserving order", () => {
    const second = { ...validRepo, name: "eva", path: "/tmp/workspace/eva" };
    const raw = JSON.stringify([validRepo, second]);
    expect(parseLinkedReposEnv(raw)).toEqual([validRepo, second]);
  });

  test("returns an empty array when the env var is missing", () => {
    expect(parseLinkedReposEnv(undefined)).toEqual([]);
  });

  test("returns an empty array when the env var is empty", () => {
    expect(parseLinkedReposEnv("")).toEqual([]);
  });

  test("returns an empty array for invalid JSON", () => {
    expect(parseLinkedReposEnv("{not json")).toEqual([]);
  });

  test("returns an empty array when the payload is not an array", () => {
    expect(parseLinkedReposEnv(JSON.stringify(validRepo))).toEqual([]);
  });

  test("returns an empty array when an entry is missing a field", () => {
    const { baseBranch: _baseBranch, ...missingBaseBranch } = validRepo;
    expect(parseLinkedReposEnv(JSON.stringify([missingBaseBranch]))).toEqual(
      [],
    );
  });

  test("returns an empty array when a field has the wrong type", () => {
    const wrongType = { ...validRepo, path: 42 };
    expect(parseLinkedReposEnv(JSON.stringify([wrongType]))).toEqual([]);
  });
});

describe("resolveAgentCwd", () => {
  const workDir = "/tmp/repo";
  const workspaceRoot = "/tmp/workspace";

  test("uses workDir for single-repo sessions (no workspace root)", () => {
    expect(resolveAgentCwd(workDir, null, false)).toBe(workDir);
    expect(resolveAgentCwd(workDir, null, true)).toBe(workDir);
  });

  test("uses workDir when useRoot is off, even with a workspace root", () => {
    expect(resolveAgentCwd(workDir, workspaceRoot, false)).toBe(workDir);
  });

  test("uses the workspace root when useRoot is on and a root exists", () => {
    expect(resolveAgentCwd(workDir, workspaceRoot, true)).toBe(workspaceRoot);
  });
});
