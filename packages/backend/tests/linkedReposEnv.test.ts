import { expect, test } from "vitest";
import { buildLinkedReposEnv } from "../convex/_sandbox_runtime/linkedReposEnv";

test("buildLinkedReposEnv returns no env vars for a single-repo session", () => {
  expect(buildLinkedReposEnv([])).toEqual({});
});

test("buildLinkedReposEnv builds the workspace root and JSON repo list", () => {
  const env = buildLinkedReposEnv([
    {
      owner: "evalucom",
      name: "carepulse-api",
      path: "/tmp/workspace/carepulse-api",
      branchName: "eva/session-abc123",
      baseBranch: "main",
    },
  ]);

  expect(env.EVA_WORKSPACE_ROOT).toBe("/tmp/workspace");
  expect(JSON.parse(env.EVA_LINKED_REPOS)).toEqual([
    {
      owner: "evalucom",
      name: "carepulse-api",
      path: "/tmp/workspace/carepulse-api",
      branchName: "eva/session-abc123",
      baseBranch: "main",
    },
  ]);
});

test("buildLinkedReposEnv strips extra fields (no prUrl, no ids)", () => {
  const env = buildLinkedReposEnv([
    {
      owner: "evalucom",
      name: "carepulse-api",
      path: "/tmp/workspace/carepulse-api",
      branchName: "eva/session-abc123",
      baseBranch: "main",
      // @ts-expect-error extra fields must not leak into the env payload
      prUrl: "https://github.com/evalucom/carepulse-api/pull/1",
      // @ts-expect-error extra fields must not leak into the env payload
      repoId: "some-id",
    },
  ]);
  const parsed = JSON.parse(env.EVA_LINKED_REPOS);
  expect(Object.keys(parsed[0]).sort()).toEqual([
    "baseBranch",
    "branchName",
    "name",
    "owner",
    "path",
  ]);
});

test("buildLinkedReposEnv serializes multiple repos in order", () => {
  const env = buildLinkedReposEnv([
    {
      owner: "evalucom",
      name: "carepulse-api",
      path: "/tmp/workspace/carepulse-api",
      branchName: "eva/session-abc123",
      baseBranch: "main",
    },
    {
      owner: "evalucom",
      name: "carepulse-worker",
      path: "/tmp/workspace/carepulse-worker",
      branchName: "eva/session-abc123",
      baseBranch: "develop",
    },
  ]);
  expect(JSON.parse(env.EVA_LINKED_REPOS)).toHaveLength(2);
  expect(JSON.parse(env.EVA_LINKED_REPOS)[1].name).toBe("carepulse-worker");
});
