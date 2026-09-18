import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { JsonObject } from "../types.js";
import type * as callbackConfig from "../config.js";

// A throwaway repo stands in for the sandbox workspace so the checkpoint reads
// real shas without touching this checkout.
const workspace = vi.hoisted((): {
  dir: string;
  entityIdField: string;
  checkoutDirs: string[];
} => {
  return {
    dir: "",
    entityIdField: "sessionId",
    checkoutDirs: [],
  };
});

vi.mock("../config.js", async (importOriginal) => {
  const original = await importOriginal<typeof callbackConfig>();
  return {
    ...original,
    RUN_ID: null,
    get ENTITY_ID_FIELD() {
      return workspace.entityIdField;
    },
    get WORK_DIR() {
      return workspace.dir;
    },
    // Single-repo by default (no EVA_LINKED_REPOS): the primary is the only
    // checked-out repo, so this must track WORK_DIR above rather than the
    // real module's own REPO_CHECKOUT_DIRS (computed from the real /tmp/repo
    // checkout this test suite runs inside of). Multi-repo tests override
    // workspace.checkoutDirs directly.
    get REPO_CHECKOUT_DIRS() {
      return workspace.checkoutDirs.length > 0
        ? workspace.checkoutDirs
        : [workspace.dir];
    },
  };
});

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
  git(["init", "-q", "-b", "eva/session-test"]);
});

afterEach(() => {
  resetTurnCheckpoint();
  workspace.entityIdField = "sessionId";
  workspace.checkoutDirs = [];
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

  test("skips task and project chat turns, whose completion mutations reject the shas", () => {
    // Task chat runs on eva/task-* with no RUN_ID, so branch and run checks
    // alone let the shas through to agentTaskChatWorkflow:handleCompletion.
    for (const entityIdField of ["taskId", "projectId"]) {
      workspace.entityIdField = entityIdField;
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
