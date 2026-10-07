import { describe, expect, test } from "vitest";
import {
  allPullRequestsTerminal,
  derivePrStateFromEvent,
  parseEvaOwnerBranch,
  summarisePullRequests,
  type PrState,
} from "../convex/_pullRequests/store";

/**
 * Pure rules behind many-PRs-per-owner: how an owner's rows roll up into the
 * summary list rows draw, when the owner counts as finished, and which owner a
 * PR opened outside Eva's own flow belongs to.
 */

/** The fields the roll-up reads; `createdAt` follows the PR number. */
function row(
  prNumber: number,
  state: PrState,
  extra: { primary?: boolean } = {},
) {
  return {
    prUrl: `https://github.com/o/r/pull/${prNumber}`,
    state,
    primary: extra.primary ?? false,
    createdAt: prNumber,
  };
}

describe("summarisePullRequests", () => {
  test("no rows clears the summary", () => {
    expect(summarisePullRequests([])).toEqual({
      prUrl: undefined,
      prState: undefined,
      prCount: undefined,
    });
  });

  test("one PR reads exactly as that PR", () => {
    expect(summarisePullRequests([row(1, "draft", { primary: true })])).toEqual(
      { prUrl: "https://github.com/o/r/pull/1", prState: "draft", prCount: 1 },
    );
  });

  test("links the primary PR even when a newer side PR exists", () => {
    const summary = summarisePullRequests([
      row(1, "open", { primary: true }),
      row(2, "draft"),
    ]);
    expect(summary.prUrl).toBe("https://github.com/o/r/pull/1");
    expect(summary.prState).toBe("open");
    expect(summary.prCount).toBe(2);
  });

  test("stays live while any PR is live, even after the primary merged", () => {
    const summary = summarisePullRequests([
      row(1, "merged", { primary: true }),
      row(2, "draft"),
    ]);
    expect(summary.prState).toBe("draft");
  });

  test("reads merged once all are terminal and one merged", () => {
    expect(
      summarisePullRequests([row(1, "closed"), row(2, "merged")]).prState,
    ).toBe("merged");
    expect(
      summarisePullRequests([row(1, "closed"), row(2, "closed")]).prState,
    ).toBe("closed");
  });

  test("falls back to the newest PR when none is primary", () => {
    expect(
      summarisePullRequests([row(4, "open"), row(9, "open")]).prUrl,
    ).toBe("https://github.com/o/r/pull/9");
  });
});

test("an owner is finished only when it holds a PR and every one is terminal", () => {
  expect(allPullRequestsTerminal([])).toBe(false);
  expect(allPullRequestsTerminal([row(1, "merged"), row(2, "open")])).toBe(
    false,
  );
  expect(allPullRequestsTerminal([row(1, "merged"), row(2, "closed")])).toBe(
    true,
  );
});

test("webhook actions map onto tracked states", () => {
  expect(derivePrStateFromEvent("closed", undefined, true)).toBe("merged");
  expect(derivePrStateFromEvent("closed", undefined, false)).toBe("closed");
  expect(derivePrStateFromEvent("opened", true, undefined)).toBe("draft");
  expect(derivePrStateFromEvent("reopened", false, undefined)).toBe("open");
  expect(derivePrStateFromEvent("converted_to_draft", undefined, undefined)).toBe(
    "draft",
  );
  expect(derivePrStateFromEvent("ready_for_review", undefined, undefined)).toBe(
    "open",
  );
  expect(derivePrStateFromEvent("edited", undefined, undefined)).toBeNull();
});

describe("parseEvaOwnerBranch", () => {
  test("reads the owner of every Eva branch shape", () => {
    expect(parseEvaOwnerBranch("eva/session-k17abc")).toEqual({
      kind: "session",
      id: "k17abc",
    });
    expect(parseEvaOwnerBranch("eva/task-j9x")).toEqual({
      kind: "task",
      id: "j9x",
    });
    expect(parseEvaOwnerBranch("eva/project-p4q-v3")).toEqual({
      kind: "project",
      id: "p4q",
    });
  });

  test("a side branch the agent opened still names its owner", () => {
    expect(parseEvaOwnerBranch("eva/session-k17abc-fix-login")).toEqual({
      kind: "session",
      id: "k17abc",
    });
  });

  test("other branches name no owner", () => {
    expect(parseEvaOwnerBranch("main")).toBeNull();
    expect(parseEvaOwnerBranch("eva/dup-fix-login")).toBeNull();
    expect(parseEvaOwnerBranch("eva/automation-a1-r2")).toBeNull();
  });
});
