import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SandboxHandle } from "../convex/_sandbox/provider";
import { pushBranchToOrigin } from "../convex/_sandbox_runtime/git";
import { publishErrorNeedsForcePush } from "../convex/_sandbox_runtime/divergedPublish";
import { git, localGitSandboxHandle } from "./_helpers/localGitSandbox";

const OWNER = "evalucom";
const REPO = "carepulse-ts";
const BRANCH = "eva/task-rewrite";
const REMOTE_URL = `https://github.com/${OWNER}/${REPO}.git`;
const STAGING_FILE_COUNT = 25;

let root: string;
let origin: string;
let sandboxRepo: string;

function commitFiles(cwd: string, subject: string, files: string[]): string {
  for (const file of files) {
    mkdirSync(join(cwd, file, ".."), { recursive: true });
    writeFileSync(join(cwd, file), `${subject}\n`);
  }
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", subject);
  return git(cwd, "rev-parse", "HEAD");
}

function isAncestor(cwd: string, ancestor: string, descendant: string): boolean {
  try {
    git(cwd, "merge-base", "--is-ancestor", ancestor, descendant);
    return true;
  } catch {
    return false;
  }
}

function sandboxHandle(): SandboxHandle {
  return localGitSandboxHandle({
    workspace: sandboxRepo,
    remote: { url: REMOTE_URL, path: origin },
  });
}

function seedPublishedBranch(): string {
  const seed = join(root, "seed");
  mkdirSync(seed);
  git(seed, "init", "-q", "-b", "main");
  commitFiles(seed, "base", ["README.md"]);
  git(seed, "checkout", "-q", "-b", "staging");
  commitFiles(
    seed,
    "staging work",
    Array.from(
      { length: STAGING_FILE_COUNT },
      (_, i) => `apps/web/staging-${i}.ts`,
    ),
  );
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-q", "origin", "main", "staging");

  git(sandboxRepo, "fetch", "-q", "origin");
  git(sandboxRepo, "checkout", "-q", "-b", BRANCH, "origin/staging");
  const tip = commitFiles(sandboxRepo, "task: feature", [
    "apps/web/feature.tsx",
  ]);
  git(sandboxRepo, "push", "-q", "-u", "origin", BRANCH);
  return tip;
}

function seedRewrittenBranch(): { oldTip: string; rewrittenTip: string } {
  const oldTip = seedPublishedBranch();
  expect(git(sandboxRepo, "diff", "--name-only", "origin/main", BRANCH).split("\n").length)
    .toBeGreaterThan(STAGING_FILE_COUNT);

  git(sandboxRepo, "rebase", "-q", "--onto", "origin/main", "origin/staging", BRANCH);
  const rewrittenTip = git(sandboxRepo, "rev-parse", "HEAD");
  expect(rewrittenTip).not.toBe(oldTip);
  expect(git(origin, "rev-parse", `refs/heads/${BRANCH}`)).toBe(oldTip);
  return { oldTip, rewrittenTip };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "eva-rewritten-publish-"));
  origin = join(root, "origin.git");
  sandboxRepo = join(root, "sandbox");
  git(root, "init", "-q", "--bare", origin);
  git(root, "clone", "-q", origin, sandboxRepo);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("publishing a rewritten eva/ branch", () => {
  test("replaces origin when the remote tip is the sandbox's own old tip", async () => {
    const { rewrittenTip } = seedRewrittenBranch();

    const result = await pushBranchToOrigin(sandboxHandle(), OWNER, REPO, BRANCH);

    expect(result).toEqual({ pushed: true, published: true });
    expect(git(origin, "rev-parse", `refs/heads/${BRANCH}`)).toBe(rewrittenTip);
    expect(git(sandboxRepo, "rev-parse", "HEAD")).toBe(rewrittenTip);
    expect(git(sandboxRepo, "rev-list", "--count", "origin/main..HEAD")).toBe("1");
  });

  test("merges, never forces, when origin holds commits the sandbox never had", async () => {
    const { oldTip, rewrittenTip } = seedRewrittenBranch();
    const reviewer = join(root, "reviewer");
    git(root, "clone", "-q", "--branch", BRANCH, origin, reviewer);
    const reviewerTip = commitFiles(reviewer, "reviewer: fix typo", [
      "apps/web/typo.tsx",
    ]);
    git(reviewer, "push", "-q", "origin", BRANCH);
    expect(reviewerTip).not.toBe(oldTip);

    const result = await pushBranchToOrigin(sandboxHandle(), OWNER, REPO, BRANCH);

    expect(result).toEqual({ pushed: true, published: true });
    const originTip = git(origin, "rev-parse", `refs/heads/${BRANCH}`);
    expect(isAncestor(sandboxRepo, reviewerTip, originTip)).toBe(true);
    expect(isAncestor(sandboxRepo, rewrittenTip, originTip)).toBe(true);
    expect(git(sandboxRepo, "rev-parse", "HEAD")).toBe(originTip);
    expect(git(sandboxRepo, "status", "--porcelain")).toBe("");
  });

  test("a rewritten branch Eva does not own is never force-pushed", async () => {
    seedRewrittenBranch();
    const shared = "release/2026-09";
    git(sandboxRepo, "branch", "-m", BRANCH, shared);
    git(sandboxRepo, "branch", "-u", `origin/${BRANCH}`, shared);
    git(origin, "update-ref", `refs/heads/${shared}`, `refs/heads/${BRANCH}`);
    git(sandboxRepo, "fetch", "-q", "origin", shared);
    const originTip = git(origin, "rev-parse", `refs/heads/${shared}`);

    await expect(
      pushBranchToOrigin(sandboxHandle(), OWNER, REPO, shared),
    ).rejects.toThrow(`${shared} is not one`);
    try {
      await pushBranchToOrigin(sandboxHandle(), OWNER, REPO, shared);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(publishErrorNeedsForcePush(message)).toBe(true);
      expect(message).toContain(`git push --force-with-lease origin ${shared}`);
    }
    expect(git(origin, "rev-parse", `refs/heads/${shared}`)).toBe(originTip);
    expect(git(sandboxRepo, "status", "--porcelain")).toBe("");
  });

  test("a lease rejection re-syncs and merges the commit that landed mid-publish", async () => {
    const { oldTip, rewrittenTip } = seedRewrittenBranch();
    const handle = sandboxHandle();
    const reviewer = join(root, "reviewer");
    git(root, "clone", "-q", "--branch", BRANCH, origin, reviewer);
    let interposed = false;
    let racedTip = "";
    const racing: SandboxHandle = {
      ...handle,
      exec: (cmd, opts) => {
        if (!interposed && cmd.includes("git push")) {
          interposed = true;
          racedTip = commitFiles(reviewer, "reviewer: landed first", [
            "apps/web/raced.tsx",
          ]);
          git(reviewer, "push", "-q", "origin", BRANCH);
        }
        return handle.exec(cmd, opts);
      },
    };

    const result = await pushBranchToOrigin(racing, OWNER, REPO, BRANCH, {
      retryAttempts: 2,
    });

    expect(interposed).toBe(true);
    expect(result).toEqual({ pushed: true, published: true });
    const originTip = git(origin, "rev-parse", `refs/heads/${BRANCH}`);
    expect(originTip).not.toBe(oldTip);
    expect(isAncestor(sandboxRepo, racedTip, originTip)).toBe(true);
    expect(isAncestor(sandboxRepo, rewrittenTip, originTip)).toBe(true);
  });
});

describe("publishing a branch that only origin advanced far", () => {
  test("quick task 220: one local commit against many foreign commits is merged, not refused", async () => {
    const publishedTip = seedPublishedBranch();
    const github = join(root, "github");
    git(root, "clone", "-q", "--branch", BRANCH, origin, github);
    let foreignTip = "";
    for (let i = 0; i < 30; i += 1) {
      foreignTip = commitFiles(github, `main work ${i}`, [
        `apps/eprocurement/main-${i}.ts`,
        `packages/db/main-${i}.ts`,
      ]);
    }
    git(github, "push", "-q", "origin", BRANCH);
    const localTip = commitFiles(sandboxRepo, "fix: show N/A for empty reason", [
      "apps/web/feature.tsx",
    ]);
    expect(
      git(sandboxRepo, "rev-list", "--left-right", "--count", `origin/${BRANCH}...HEAD`),
    ).toBe("0\t1");

    const result = await pushBranchToOrigin(sandboxHandle(), OWNER, REPO, BRANCH);

    expect(result).toEqual({ pushed: true, published: true });
    const originTip = git(origin, "rev-parse", `refs/heads/${BRANCH}`);
    expect(isAncestor(sandboxRepo, foreignTip, originTip)).toBe(true);
    expect(isAncestor(sandboxRepo, localTip, originTip)).toBe(true);
    expect(isAncestor(sandboxRepo, publishedTip, originTip)).toBe(true);
    expect(git(sandboxRepo, "rev-parse", "HEAD")).toBe(originTip);
    expect(git(sandboxRepo, "status", "--porcelain")).toBe("");
  });
});
