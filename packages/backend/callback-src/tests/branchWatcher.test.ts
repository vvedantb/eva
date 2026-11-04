import { describe, it, expect, afterEach } from "vitest";
import {
  decideGitStateReport,
  formatBranch,
  resolveBranchTarget,
  startBranchWatcher,
  stopBranchWatcher,
} from "../runtime/branchWatcher.js";

describe("resolveBranchTarget", () => {
  it("maps each launcher entity field onto its mutation target", () => {
    expect(resolveBranchTarget("sessionId", "s1")).toEqual({
      kind: "session",
      sessionId: "s1",
    });
    expect(resolveBranchTarget("taskId", "t1")).toEqual({
      kind: "task",
      taskId: "t1",
    });
    expect(resolveBranchTarget("projectId", "p1")).toEqual({
      kind: "project",
      projectId: "p1",
    });
  });

  it("returns null for unknown or missing owners", () => {
    expect(resolveBranchTarget("arenaId", "a1")).toBe(null);
    expect(resolveBranchTarget(undefined, "s1")).toBe(null);
    expect(resolveBranchTarget("sessionId", undefined)).toBe(null);
    expect(resolveBranchTarget("sessionId", "")).toBe(null);
  });
});

describe("formatBranch", () => {
  it("uses the branch name when HEAD is attached", () => {
    expect(formatBranch("eva/session-abc\n", "")).toBe("eva/session-abc");
  });

  it("falls back to the short sha on detached HEAD", () => {
    expect(formatBranch("HEAD", "a1b2c3d\n")).toBe("a1b2c3d");
  });

  it("returns null when neither is readable", () => {
    expect(formatBranch("HEAD", "  ")).toBe(null);
    expect(formatBranch("", "a1b2c3d")).toBe(null);
  });
});

describe("decideGitStateReport", () => {
  const clean = { uncommittedFiles: 0, unpushedCommits: 0 };
  const dirty = { uncommittedFiles: 2, unpushedCommits: 1 };

  it("sends the first reading", () => {
    const current = { branch: "main", sync: clean };
    expect(decideGitStateReport({ current, lastReported: null })).toBe(current);
  });

  it("sends a changed branch", () => {
    const current = { branch: "staging", sync: clean };
    expect(
      decideGitStateReport({
        current,
        lastReported: { branch: "main", sync: clean },
      }),
    ).toBe(current);
  });

  it("sends changed counts on the same branch", () => {
    const current = { branch: "main", sync: dirty };
    expect(
      decideGitStateReport({
        current,
        lastReported: { branch: "main", sync: clean },
      }),
    ).toBe(current);
  });

  it("stays quiet when unchanged", () => {
    expect(
      decideGitStateReport({
        current: { branch: "main", sync: { ...dirty } },
        lastReported: { branch: "main", sync: dirty },
      }),
    ).toBe(null);
  });

  it("stays quiet when git could not be read", () => {
    expect(
      decideGitStateReport({
        current: null,
        lastReported: { branch: "main", sync: clean },
      }),
    ).toBe(null);
    expect(decideGitStateReport({ current: null, lastReported: null })).toBe(
      null,
    );
  });
});

describe("startBranchWatcher", () => {
  afterEach(() => {
    stopBranchWatcher();
  });

  it("is a no-op without a reportable entity", () => {
    // No ENTITY_ID / ENTITY_ID_FIELD in the test env, so no timers or watchers
    // may be installed — nothing to report onto.
    expect(() => startBranchWatcher()).not.toThrow();
    expect(() => stopBranchWatcher()).not.toThrow();
  });
});
