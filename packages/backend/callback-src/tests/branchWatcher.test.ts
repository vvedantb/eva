import { describe, it, expect, afterEach, vi } from "bun:test";
import { stubEnv, unstubAllEnvs } from "../../tests/_helpers/env";
import { freshModules } from "./freshModules";
import {
  decideGitStateReport,
  formatBranch,
  resolveBranchTarget,
} from "../runtime/branchWatcher.js";

describe("resolveBranchTarget", () => {
  it("maps each launcher entity field onto its mutation target", () => {
    expect(resolveBranchTarget("sessionId", "s1")).toEqual({
      kind: "session",
      sessionId: "s1",
    });
    expect(resolveBranchTarget("chatId", "c1")).toEqual({
      kind: "sessionChat",
      chatId: "c1",
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
    vi.useRealTimers();
    unstubAllEnvs();
    freshModules();
  });

  it("installs no poll without a reportable entity", async () => {
    stubEnv("ENTITY_ID_FIELD", "arenaId");
    stubEnv("ENTITY_ID", "a1");
    freshModules();
    vi.useFakeTimers();
    const { startBranchWatcher } = await import("../runtime/branchWatcher.js");
    startBranchWatcher();
    expect(vi.getTimerCount()).toBe(0);
  });
});
