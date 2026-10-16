import { describe, expect, test } from "vitest";
import {
  buildPrWatchMessage,
  evaluatePrWatch,
  newPrWatch,
  PR_WATCH_COMMENT_WAKE_LIMIT,
  prWatchUrls,
  type PrSnapshot,
  type PrWatch,
  type WatchedCheck,
} from "../convex/_pullRequests/watchEvaluate";
import type { FeedbackItem } from "../convex/_automationEvents/messages";
import { parseCiCompleted } from "../convex/_automationEvents/events";

const PR_URL = "https://github.com/acme/app/pull/12";

function check(
  name: string,
  state: WatchedCheck["state"],
  extra: Partial<WatchedCheck> = {},
): WatchedCheck {
  return {
    name,
    state,
    conclusion: state === "failed" ? "failure" : null,
    required: false,
    url: null,
    ...extra,
  };
}

function snapshot(extra: Partial<PrSnapshot> = {}): PrSnapshot {
  return {
    headSha: "abc1234def",
    checks: [],
    mergeability: "mergeable",
    remarks: [],
    remarksNewestAt: null,
    ...extra,
  };
}

const remark: FeedbackItem = {
  author: "alice",
  body: "Please rename this.",
  url: `${PR_URL}#discussion_r1`,
  path: "src/a.ts",
  line: 3,
};

/** A watch that has already seen `abc1234def`. */
function seen(extra: Partial<PrWatch> = {}): PrWatch {
  return { ...newPrWatch(1_000), headSha: "abc1234def", ...extra };
}

describe("evaluatePrWatch", () => {
  test("pending checks wake nobody", () => {
    const report = evaluatePrWatch(
      seen(),
      snapshot({ checks: [check("build", "pending")] }),
    );
    expect(report.changes).toEqual([]);
    expect(report.exhausted).toBe(false);
  });

  test("a newly failed check wakes once, even while others still run", () => {
    const first = evaluatePrWatch(
      seen(),
      snapshot({
        checks: [check("build", "failed"), check("e2e", "pending")],
      }),
    );
    expect(first.changes).toEqual([
      { kind: "checks_failed", failed: [check("build", "failed")] },
    ]);
    expect(first.next.failedChecks).toEqual(["build"]);

    const again = evaluatePrWatch(
      first.next,
      snapshot({ checks: [check("build", "failed"), check("e2e", "pending")] }),
    );
    expect(again.changes).toEqual([]);
  });

  test("a check that fails again after a rerun is news", () => {
    const rerun = evaluatePrWatch(
      seen({ failedChecks: ["build"] }),
      snapshot({ checks: [check("build", "pending")] }),
    );
    expect(rerun.next.failedChecks).toEqual([]);
    const failedAgain = evaluatePrWatch(
      rerun.next,
      snapshot({ checks: [check("build", "failed")] }),
    );
    expect(failedAgain.changes.map((change) => change.kind)).toEqual([
      "checks_failed",
    ]);
  });

  test("all checks passing is reported once", () => {
    const report = evaluatePrWatch(
      seen(),
      snapshot({ checks: [check("build", "passed"), check("lint", "passed")] }),
    );
    expect(report.changes).toEqual([
      { kind: "checks_passed", count: 2, required: false },
    ]);
    expect(report.next.passed).toBe(true);
    expect(
      evaluatePrWatch(
        report.next,
        snapshot({
          checks: [check("build", "passed"), check("lint", "passed")],
        }),
      ).changes,
    ).toEqual([]);
  });

  test("only required checks gate 'passed' when some are required", () => {
    const report = evaluatePrWatch(
      seen(),
      snapshot({
        checks: [
          check("build", "passed", { required: true }),
          check("preview", "pending"),
        ],
      }),
    );
    expect(report.changes).toEqual([
      { kind: "checks_passed", count: 1, required: true },
    ]);
  });

  test("a new head commit starts the check record over", () => {
    const report = evaluatePrWatch(
      seen({ failedChecks: ["build"], passed: true }),
      snapshot({ headSha: "fff0000", checks: [check("build", "failed")] }),
    );
    expect(report.changes.map((change) => change.kind)).toEqual([
      "checks_failed",
    ]);
    expect(report.next.headSha).toBe("fff0000");
  });

  test("a new conflict wakes; unknown keeps the last answer", () => {
    const conflict = evaluatePrWatch(
      seen(),
      snapshot({ mergeability: "conflicting" }),
    );
    expect(conflict.changes).toEqual([{ kind: "conflicting" }]);
    const computing = evaluatePrWatch(
      conflict.next,
      snapshot({ mergeability: "unknown" }),
    );
    expect(computing.changes).toEqual([]);
    expect(computing.next.conflicting).toBe(true);
    const resolved = evaluatePrWatch(computing.next, snapshot());
    expect(resolved.next.conflicting).toBe(false);
  });

  test("new comments wake and move the cursor", () => {
    const report = evaluatePrWatch(
      seen(),
      snapshot({ remarks: [remark], remarksNewestAt: 5_000 }),
    );
    expect(report.changes).toEqual([{ kind: "remarks", remarks: [remark] }]);
    expect(report.next.remarksThrough).toBe(5_000);
    expect(report.next.commentWakes).toBe(1);
  });

  test("the watch ends after the comment-only wake cap", () => {
    const report = evaluatePrWatch(
      seen({ commentWakes: PR_WATCH_COMMENT_WAKE_LIMIT - 1 }),
      snapshot({ remarks: [remark], remarksNewestAt: 5_000 }),
    );
    expect(report.exhausted).toBe(true);
  });

  test("the first read records the baseline without reporting old state", () => {
    const baseline = evaluatePrWatch(
      newPrWatch(1_000),
      snapshot({
        checks: [check("build", "failed"), check("lint", "passed")],
        mergeability: "conflicting",
      }),
    );
    expect(baseline.changes).toEqual([]);
    expect(baseline.next).toMatchObject({
      headSha: "abc1234def",
      failedChecks: ["build"],
      passed: false,
      conflicting: true,
    });
    const passedBaseline = evaluatePrWatch(
      newPrWatch(1_000),
      snapshot({ checks: [check("build", "passed")] }),
    );
    expect(passedBaseline.changes).toEqual([]);
    expect(passedBaseline.next.passed).toBe(true);
    // Later news is still reported against that baseline.
    const later = evaluatePrWatch(
      baseline.next,
      snapshot({
        checks: [check("build", "failed"), check("lint", "failed")],
        mergeability: "conflicting",
      }),
    );
    expect(later.changes).toEqual([
      { kind: "checks_failed", failed: [check("lint", "failed")] },
    ]);
  });

  test("the first read still reports comments made since the watch began", () => {
    const report = evaluatePrWatch(
      newPrWatch(1_000),
      snapshot({
        checks: [check("build", "failed")],
        remarks: [remark],
        remarksNewestAt: 5_000,
      }),
    );
    expect(report.changes).toEqual([{ kind: "remarks", remarks: [remark] }]);
    expect(report.next.remarksThrough).toBe(5_000);
  });

  test("check news resets the comment-only count", () => {
    const report = evaluatePrWatch(
      seen({ commentWakes: PR_WATCH_COMMENT_WAKE_LIMIT - 1 }),
      snapshot({
        checks: [check("build", "failed")],
        remarks: [remark],
        remarksNewestAt: 5_000,
      }),
    );
    expect(report.exhausted).toBe(false);
    expect(report.next.commentWakes).toBe(0);
  });
});

describe("buildPrWatchMessage", () => {
  test("lists each change and tells the agent to end its turn", () => {
    const report = evaluatePrWatch(
      seen(),
      snapshot({
        checks: [
          check("build", "failed", { url: "https://ci.example/1" }),
          check("deploy", "failed", { conclusion: "cancelled" }),
        ],
        mergeability: "conflicting",
        remarks: [remark],
        remarksNewestAt: 5_000,
      }),
    );
    expect(
      buildPrWatchMessage({
        prNumber: 12,
        prUrl: PR_URL,
        baseBranch: "main",
        headSha: "abc1234def",
        report,
      }),
    ).toBe(
      [
        `**Update on #12** (${PR_URL}), which Eva is watching for you:`,
        "- Checks failed on `abc1234`:",
        "  - build ([details](https://ci.example/1))",
        "  - deploy (cancelled)",
        "- 1 new comment (quoted below).",
        "- The branch now conflicts with `main`.",
        "",
        `**@alice** on \`src/a.ts:3\` ([link](${PR_URL}#discussion_r1)):`,
        "> Please rename this.",
        "",
        "Look into each item and act on it as your task requires. Eva keeps watching and wakes you on the next change, so end your turn when you are done. Call `unwatch_pull_request` when you no longer need updates.",
      ].join("\n"),
    );
  });

  test("the last wake says the watch stopped", () => {
    const report = evaluatePrWatch(
      seen({ commentWakes: PR_WATCH_COMMENT_WAKE_LIMIT - 1 }),
      snapshot({ remarks: [remark], remarksNewestAt: 5_000 }),
    );
    expect(
      buildPrWatchMessage({
        prNumber: 12,
        prUrl: PR_URL,
        baseBranch: "main",
        headSha: "abc1234def",
        report,
      }),
    ).toContain("Eva stopped watching after 10 comment-only updates");
  });
});

describe("prWatchUrls", () => {
  const base = { owner: "acme", name: "app", prUrl: PR_URL, prNumber: 12 };
  const OTHER_URL = "https://github.com/acme/app/pull/13";

  test("completed suites and trusted feedback name their PR once each", () => {
    expect(
      prWatchUrls(
        [
          { kind: "pr_feedback", ...base },
          { kind: "pr_opened", ...base, title: "x" },
        ],
        { kind: "check_suite", prUrls: [PR_URL, OTHER_URL] },
      ),
    ).toEqual([PR_URL, OTHER_URL]);
  });

  test("a commit status names no PR", () => {
    expect(
      prWatchUrls([], {
        kind: "status",
        owner: "acme",
        name: "app",
        branches: ["feature"],
      }),
    ).toEqual([]);
  });
});

describe("parseCiCompleted", () => {
  const repository = { name: "app", owner: { login: "acme" } };

  test.each(["success", "failure", "cancelled", "skipped", "neutral", "stale"])(
    "a check suite completed as %s names its PRs",
    (conclusion) => {
      const body = JSON.stringify({
        action: "completed",
        check_suite: {
          conclusion,
          head_sha: "abc",
          pull_requests: [{ number: 12 }],
        },
        repository,
      });
      expect(parseCiCompleted("check_suite", body)).toEqual({
        kind: "check_suite",
        prUrls: [PR_URL],
      });
    },
  );

  test("a final commit status names the branches whose head it is", () => {
    const body = (state: string) =>
      JSON.stringify({
        sha: "abc",
        state,
        branches: [
          { name: "feature", commit: { sha: "abc" } },
          { name: "main", commit: { sha: "def" } },
        ],
        repository,
      });
    expect(parseCiCompleted("status", body("error"))).toEqual({
      kind: "status",
      owner: "acme",
      name: "app",
      branches: ["feature"],
    });
    expect(parseCiCompleted("status", body("pending"))).toBeNull();
    expect(parseCiCompleted("check_suite", "not json")).toBeNull();
  });
});
