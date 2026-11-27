import { describe, expect, test } from "bun:test";
import {
  canMergePr,
  canSubmitReview,
  checksHeadline,
  checksOverallTone,
  countChecks,
  headerBlocker,
  mergeBlocker,
  revertSessionRequest,
  type PrCheck,
  type PrOverview,
} from "@eva/shared";
import { overview } from "./prOverviewFixture";

type BlockerKind = NonNullable<ReturnType<typeof headerBlocker>>["kind"];

const BASE_CHECK: PrCheck = {
  kind: "check",
  name: "typecheck",
  status: "completed",
  conclusion: "success",
  htmlUrl: null,
  description: null,
};

function check(partial: Partial<PrCheck>): PrCheck {
  return { ...BASE_CHECK, ...partial };
}

describe("mergeBlocker", () => {
  test("a clean open pull request has nothing in the way", () => {
    expect(mergeBlocker(overview({}))).toBeNull();
  });

  const FINISHED_STATUSES: PrOverview["status"][] = ["closed", "merged"];

  test.each(FINISHED_STATUSES)(
    "a %s pull request reports no blocker at all",
    (status) => {      expect(
        mergeBlocker(
          overview({ status, mergeable: false, mergeableState: "dirty" }),
        ),
      ).toBeNull();
    },
  );

  test("a draft outranks the conflicts underneath it", () => {    const blocker = mergeBlocker(
      overview({ draft: true, mergeable: false, mergeableState: "dirty" }),
    );
    expect(blocker?.kind).toBe("draft");
    expect(blocker?.remedy).toBeNull();
  });

  test("unknown mergeability is reported as pending, never as a conflict", () => {    const blocker = mergeBlocker(
      overview({ mergeable: null, mergeableState: "unknown" }),
    );
    expect(blocker?.kind).toBe("checking");
    expect(blocker?.tone).toBe("pending");
  });

  test("conflicts offer a rebase session onto the base branch", () => {
    const blocker = mergeBlocker(
      overview({
        number: 42,
        baseRef: "release",
        mergeable: false,
        mergeableState: "dirty",
      }),
    );
    expect(blocker?.kind).toBe("conflicts");
    expect(blocker?.remedy?.sessionTitle).toBe("Resolve conflicts on #42");
    expect(blocker?.remedy?.prompt).toContain("release");
  });

  test("an unmergeable branch with no known cause offers no remedy", () => {    const blocker = mergeBlocker(
      overview({ mergeable: false, mergeableState: "unstable" }),
    );
    expect(blocker?.kind).toBe("unmergeable");
    expect(blocker?.remedy).toBeNull();
  });

  test("a branch behind its base offers an update session", () => {
    const blocker = mergeBlocker(
      overview({ baseRef: "main", mergeableState: "behind" }),
    );
    expect(blocker?.kind).toBe("behind");
    expect(blocker?.remedy?.prompt).toContain("main");
  });

  test("branch protection is reported without a remedy", () => {
    const blocker = mergeBlocker(overview({ mergeableState: "blocked" }));
    expect(blocker?.kind).toBe("protected");
    expect(blocker?.remedy).toBeNull();
  });
});

describe("headerBlocker", () => {
  test.each(["draft", "checking"])(
    "%s stays out of the header",
    (hiddenKind) => {      const source =
        hiddenKind === "draft"
          ? overview({ draft: true })
          : overview({ mergeable: null });
      expect(mergeBlocker(source)?.kind).toBe(hiddenKind);
      expect(headerBlocker(source)).toBeNull();
    },
  );

  test.each<[string, BlockerKind]>([
    ["dirty", "conflicts"],
    ["unstable", "unmergeable"],
  ])("a %s branch keeps its header badge", (mergeableState, kind) => {
    expect(
      headerBlocker(overview({ mergeable: false, mergeableState }))?.kind,
    ).toBe(kind);
  });

  test.each<[string, BlockerKind]>([
    ["blocked", "protected"],
    ["behind", "behind"],
  ])("a %s branch keeps its header badge", (mergeableState, kind) => {
    expect(headerBlocker(overview({ mergeableState }))?.kind).toBe(kind);
  });
});

describe("check roll-up", () => {
  test("counts each tone and keeps the total", () => {
    expect(
      countChecks([
        check({ conclusion: "success" }),
        check({ conclusion: "failure" }),
        check({ status: "in_progress", conclusion: null }),
        check({ conclusion: "skipped" }),
      ]),
    ).toEqual({
      success: 1,
      failure: 1,
      pending: 1,
      neutral: 1,
      total: 4,
    });
  });

  test("the worst outcome wins over any number of better ones", () => {    expect(
      checksOverallTone(
        countChecks([
          ...Array.from({ length: 20 }, () => check({})),
          check({ conclusion: "failure" }),
        ]),
      ),
    ).toBe("failure");
  });

  test("anything still running outranks a clean but unfinished result", () => {
    expect(
      checksOverallTone(
        countChecks([check({}), check({ status: "queued", conclusion: null })]),
      ),
    ).toBe("pending");
  });

  test("no checks at all is neutral, not success", () => {
    expect(checksOverallTone(countChecks([]))).toBe("neutral");
  });

  test('"all passed" needs nothing failing and nothing running', () => {
    expect(checksHeadline(countChecks([check({}), check({})]))).toBe(
      "All checks have passed",
    );
    expect(
      checksHeadline(
        countChecks([check({}), check({ status: "in_progress", conclusion: null })]),
      ),
    ).toBe("1 in progress · 1 passing");
  });

  test("a skipped-only run does not claim everything passed", () => {
    expect(checksHeadline(countChecks([check({ conclusion: "skipped" })]))).toBe(
      "1 skipped",
    );
  });
});

describe("action gates", () => {
  test("merge is live only on an open, ready, mergeable pull request", () => {
    expect(canMergePr(overview({}))).toBe(true);
    expect(canMergePr(overview({ draft: true }))).toBe(false);
    expect(canMergePr(overview({ mergeable: null }))).toBe(false);
    expect(canMergePr(overview({ mergeable: false }))).toBe(false);
    expect(canMergePr(overview({ status: "merged" }))).toBe(false);
  });

  test("a review needs what GitHub needs", () => {
    expect(canSubmitReview("APPROVE", "", 0)).toBe(true);
    expect(canSubmitReview("COMMENT", "  ", 0)).toBe(false);
    expect(canSubmitReview("COMMENT", "", 2)).toBe(true);
    expect(canSubmitReview("COMMENT", "Nice", 0)).toBe(true);
    expect(canSubmitReview("REQUEST_CHANGES", "", 3)).toBe(false);
    expect(canSubmitReview("REQUEST_CHANGES", "Rename it", 0)).toBe(true);
  });
});

describe("revertSessionRequest", () => {
  test("starts on the base branch and names the merge commit when there is one", () => {
    const merged = overview({ number: 7, title: "Add feature", status: "merged", baseRef: "main", mergeCommitSha: "abc123" });
    const request = revertSessionRequest(merged);
    expect(request.title).toBe("Revert #7");
    expect(request.baseBranch).toBe("main");
    expect(request.message).toContain("git revert -m 1 abc123");

    const squashed = revertSessionRequest({ ...merged, mergeCommitSha: null });
    expect(squashed.message).toBe(
      'Revert the changes pull request #7 ("Add feature") merged into `main`. Open a pull request with the revert.',
    );
  });
});
