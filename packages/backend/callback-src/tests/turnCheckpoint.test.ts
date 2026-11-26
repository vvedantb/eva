import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { JsonObject } from "../types.js";

// A throwaway repo stands in for the sandbox workspace so the checkpoint reads
// real shas without touching this checkout.
const workspace: {
  dir: string;
  entityIdField: string;
  checkoutDirs: string[];
} = {
  dir: "",
  entityIdField: "chatId",
  checkoutDirs: [],
};

const originalConfig = { ...(await import("../config.js")) };
// Bun copies a mocked module's exports once, so re-mock after each change.
// Single-repo by default (no EVA_LINKED_REPOS): the primary is the only
// checked-out repo, so REPO_CHECKOUT_DIRS tracks WORK_DIR rather than the real
// module's own value (computed from the /tmp/repo checkout this suite runs
// inside of). Multi-repo tests set workspace.checkoutDirs.
function mockConfig(): void {
  const { dir, entityIdField, checkoutDirs } = workspace;
  mock.module("../config.js", () => ({
    ...originalConfig,
    RUN_ID: null,
    ENTITY_ID_FIELD: entityIdField,
    WORK_DIR: dir,
    REPO_CHECKOUT_DIRS: checkoutDirs.length > 0 ? checkoutDirs : [dir],
  }));
}
mockConfig();

const { appendTurnCheckpoint, beginTurnCheckpoint, resetTurnCheckpoint } =
  await import("../runtime/turnCheckpoint.js");

function git(args: string[]): string {
  const result = spawnSync("git", ["-C", workspace.dir, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function commit(message: string): string {
  writeFileSync(join(workspace.dir, "file.txt"), message);
  git(["add", "file.txt"]);
  git(["commit", "-q", "-m", message]);
  return git(["rev-parse", "HEAD"]);
}

beforeEach(() => {
  workspace.dir = mkdtempSync(join(tmpdir(), "turn-checkpoint-"));
  mockConfig();
  git(["init", "-q", "-b", "eva/session-test"]);
});

afterEach(() => {
  resetTurnCheckpoint();
  workspace.entityIdField = "chatId";
  workspace.checkoutDirs = [];
  mockConfig();
});

describe("appendTurnCheckpoint", () => {
  test("stamps the turn-start sha and the post-persist HEAD", () => {
    const before = commit("start");
    beginTurnCheckpoint();
    const after = commit("turn work");
    const args: JsonObject = {};
    appendTurnCheckpoint(args);
    expect(args).toEqual({
      beforeSha: before,
      afterSha: after,
      beforeShas: [{ path: workspace.dir, sha: before }],
      afterShas: [{ path: workspace.dir, sha: after }],
    });
  });

  test("equal shas when the turn changed nothing", () => {
    const head = commit("start");
    beginTurnCheckpoint();
    const args: JsonObject = {};
    appendTurnCheckpoint(args);
    expect(args).toEqual({
      beforeSha: head,
      afterSha: head,
      beforeShas: [{ path: workspace.dir, sha: head }],
      afterShas: [{ path: workspace.dir, sha: head }],
    });
  });

  test("skips turns that never began a checkpoint", () => {
    commit("start");
    const args: JsonObject = {};
    appendTurnCheckpoint(args);
    expect(args).toEqual({});
  });

  test("skips entity kinds with no persistence path", () => {
    // Nothing downstream of these reads the shas, so they are left off the
    // payload rather than written and ignored.
    for (const entityIdField of ["entityId"]) {
      workspace.entityIdField = entityIdField;
      mockConfig();
      commit("start " + entityIdField);
      beginTurnCheckpoint();
      commit("turn work " + entityIdField);
      const args: JsonObject = { success: true };
      appendTurnCheckpoint(args);
      expect(args).toEqual({ success: true });
      resetTurnCheckpoint();
    }
  });

  test("skips non-eva branches", () => {
    commit("start");
    git(["checkout", "-q", "-b", "main"]);
    beginTurnCheckpoint();
    const args: JsonObject = {};
    appendTurnCheckpoint(args);
    expect(args).toEqual({});
  });

  test("multi-repo: records a sha per checked-out repo, primary first, skipping a missing one", () => {
    const linkedDir = mkdtempSync(join(tmpdir(), "turn-checkpoint-linked-"));
    spawnSync("git", ["init", "-q", "-b", "main", linkedDir]);
    const linkedGit = (args: string[]): string => {
      const result = spawnSync("git", ["-C", linkedDir, ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@t",
        },
      });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    writeFileSync(join(linkedDir, "file.txt"), "linked start");
    linkedGit(["add", "file.txt"]);
    linkedGit(["commit", "-q", "-m", "linked start"]);
    const linkedBefore = linkedGit(["rev-parse", "HEAD"]);

    const missingDir = join(tmpdir(), "turn-checkpoint-missing-does-not-exist");
    workspace.checkoutDirs = [workspace.dir, linkedDir, missingDir];
    mockConfig();

    const before = commit("start");
    beginTurnCheckpoint();
    const after = commit("turn work");
    writeFileSync(join(linkedDir, "file.txt"), "linked turn work");
    linkedGit(["add", "file.txt"]);
    linkedGit(["commit", "-q", "-m", "linked turn work"]);
    const linkedAfter = linkedGit(["rev-parse", "HEAD"]);

    const args: JsonObject = {};
    appendTurnCheckpoint(args);
    expect(args).toEqual({
      beforeSha: before,
      afterSha: after,
      beforeShas: [
        { path: workspace.dir, sha: before },
        { path: linkedDir, sha: linkedBefore },
      ],
      afterShas: [
        { path: workspace.dir, sha: after },
        { path: linkedDir, sha: linkedAfter },
      ],
    });
  });
});
