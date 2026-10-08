import { describe, expect, test } from "vitest";
import { formatEnvFile } from "../convex/_sandbox_runtime/envFile";
import {
  branchExistsRemoteCommand,
  freshCloneCheckoutCommand,
  resumeCheckoutCommand,
} from "../convex/_sandbox_runtime/linkedRepoBranch";
import { revertTargets } from "../convex/_sandbox_runtime/turnRevert";

describe("formatEnvFile", () => {
  test("returns an empty string for no vars", () => {
    expect(formatEnvFile({})).toBe("");
  });

  test("formats a single var as KEY='value'", () => {
    expect(formatEnvFile({ FOO: "bar" })).toBe("FOO='bar'\n");
  });

  test("formats multiple vars, one per line, in key order", () => {
    expect(formatEnvFile({ FOO: "bar", BAZ: "qux" })).toBe(
      "FOO='bar'\nBAZ='qux'\n",
    );
  });

  test("escapes embedded single quotes", () => {
    expect(formatEnvFile({ FOO: "it's a test" })).toBe(
      "FOO='it'\\''s a test'\n",
    );
  });

  test("leaves an empty value as an empty quoted string", () => {
    expect(formatEnvFile({ FOO: "" })).toBe("FOO=''\n");
  });
});

describe("freshCloneCheckoutCommand", () => {
  test("checks out from the remote session branch when it already exists", () => {
    expect(
      freshCloneCheckoutCommand(
        "/tmp/workspace/carepulse-api",
        "eva/session-abc123",
        "main",
        true,
      ),
    ).toBe(
      "cd /tmp/workspace/carepulse-api && git checkout -B eva/session-abc123 origin/eva/session-abc123",
    );
  });

  test("starts fresh from the base branch when the session branch is new", () => {
    expect(
      freshCloneCheckoutCommand(
        "/tmp/workspace/carepulse-api",
        "eva/session-abc123",
        "main",
        false,
      ),
    ).toBe(
      "cd /tmp/workspace/carepulse-api && git checkout -B eva/session-abc123 origin/main",
    );
  });
});

describe("resumeCheckoutCommand", () => {
  test("plain checkout when the branch already exists locally", () => {
    expect(
      resumeCheckoutCommand(
        "/tmp/workspace/carepulse-api",
        "eva/session-abc123",
        "main",
        true,
      ),
    ).toBe(
      "cd /tmp/workspace/carepulse-api && git checkout eva/session-abc123",
    );
  });

  test("creates the branch from origin/<base> when it is missing locally", () => {
    expect(
      resumeCheckoutCommand(
        "/tmp/workspace/carepulse-api",
        "eva/session-abc123",
        "main",
        false,
      ),
    ).toBe(
      "cd /tmp/workspace/carepulse-api && git checkout -B eva/session-abc123 origin/main",
    );
  });
});

describe("branchExistsRemoteCommand", () => {
  test("builds an ls-remote check scoped to the repo's own path", () => {
    expect(
      branchExistsRemoteCommand(
        "/tmp/workspace/carepulse-api",
        "eva/session-abc123",
      ),
    ).toBe(
      "cd /tmp/workspace/carepulse-api && git ls-remote --heads origin eva/session-abc123",
    );
  });
});

describe("revertTargets", () => {
  test("uses every repo the turn checkpointed when beforeShas exists", () => {
    expect(
      revertTargets({
        beforeSha: "primaryonly",
        beforeShas: [
          { path: "/tmp/repo", sha: "aaa" },
          { path: "/tmp/workspace/carepulse-api", sha: "bbb" },
        ],
      }),
    ).toEqual([
      { path: "/tmp/repo", sha: "aaa" },
      { path: "/tmp/workspace/carepulse-api", sha: "bbb" },
    ]);
  });

  // Turns recorded before multi-repo checkpoints existed, and every
  // single-repo session: `path: undefined` resolves to the primary's dir at
  // exec time.
  test("falls back to the scalar beforeSha for the primary repo", () => {
    expect(revertTargets({ beforeSha: "aaa" })).toEqual([
      { path: undefined, sha: "aaa" },
    ]);
  });

  test("ignores an empty beforeShas array in favour of the scalar", () => {
    expect(revertTargets({ beforeSha: "aaa", beforeShas: [] })).toEqual([
      { path: undefined, sha: "aaa" },
    ]);
  });

  test("returns nothing when the turn recorded no sha at all", () => {
    expect(revertTargets({})).toEqual([]);
    expect(revertTargets({ beforeShas: [] })).toEqual([]);
  });
});
