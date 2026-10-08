import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type * as callbackConfig from "../config.js";

// WORK_DIR tracks a throwaway dir so the default `cwd` never touches this checkout.
const workspace = vi.hoisted((): { dir: string } => ({ dir: "" }));

vi.mock("../config.js", async (importOriginal) => {
  const original = await importOriginal<typeof callbackConfig>();
  return {
    ...original,
    get WORK_DIR() {
      return workspace.dir;
    },
  };
});

const { git, readCurrentBranch } = await import("../runtime/gitExec.js");

function initRepo(dir: string, branch: string): void {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  spawnSync("git", ["init", "-q", "-b", branch, dir], { env });
  spawnSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "init"], {
    env,
  });
}

const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "git-exec-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  workspace.dir = makeTempDir();
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("gitExec", () => {
  test("readCurrentBranch reads the WORK_DIR checkout's branch", () => {
    initRepo(workspace.dir, "eva/demo");
    expect(readCurrentBranch()).toBe("eva/demo");
  });

  test("readCurrentBranch returns empty outside a git repo", () => {
    expect(readCurrentBranch()).toBe("");
  });

  test("git runs in the cwd override instead of WORK_DIR", () => {
    const other = makeTempDir();
    initRepo(other, "main");
    expect(git(["rev-parse", "--abbrev-ref", "HEAD"]).ok).toBe(false);
    expect(git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: other })).toEqual({
      ok: true,
      out: "main",
    });
  });
});
