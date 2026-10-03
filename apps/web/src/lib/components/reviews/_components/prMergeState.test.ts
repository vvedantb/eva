import { describe, expect, test } from "vitest";
import {
  checksHeadline,
  checksOverallTone,
  checksWorstFirst,
  countChecks,
  headerBlocker,
  mergeBlocker,
} from "./prMergeState";
import { overview } from "./prOverviewFixture";
import type { PrCheck, PrOverview } from "./prOverviewMeta";

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

/**
 * The review header, the merge button's tooltip and the Checks tab all read
 * their verdict from here, so a wrong branch shows the reader a remedy for a
 * problem they do not have — or hides the one they do. Commit 796b4087 was this
 * class of bug from the other direction: an action gated on the pull request
 * still being open, which quietly removed it the moment the branch merged.
 */
describe("mergeBlocker", () => {
  test("a clean open pull request has nothing in the way", () => {
    expect(mergeBlocker(overview({}))).toBeNull();
  });

  const FINISHED_STATUSES: PrOverview["status"][] = ["closed", "merged"];

  test.each(FINISHED_STATUSES)(
    "a %s pull request reports no blocker at all",
    (status) => {
      // Nothing can be done about a branch that is no longer merging, so the
      // header must not offer conflict remedies on it. Every field below still
      // says "conflicted" — only the lifecycle has moved on.
      expect(
        mergeBlocker(
          overview({ status, mergeable: false, mergeableState: "dirty" }),
        ),
      ).toBeNull();
    },
  );

  test("a draft outranks the conflicts underneath it", () => {
    // Both are true at once on a conflicted draft. Leading with conflicts would
    // send the reader into a rebase session for a branch nobody can merge yet.
    const blocker = mergeBlocker(
      overview({ draft: true, mergeable: false, mergeableState: "dirty" }),
    );
    expect(blocker?.kind).toBe("draft");
    expect(blocker?.remedy).toBeNull();
  });

  test("unknown mergeability is reported as pending, never as a conflict", () => {
    // GitHub answers `null` for a second or two after every push. Treating that
    // as unmergeable flashes a false "cannot merge" on healthy branches.
    const blocker = mergeBlocker(
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

  test("an unmergeable branch with no known cause offers no remedy", () => {
    // A session cannot fix what GitHub has not named, and offering one anyway
    // spends a sandbox to reach the same dead end.
    const blocker = mergeBlocker(
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
    (hiddenKind) => {
      // The lifecycle pill already says "Draft", and mergeability bookkeeping is
      // not something the reader can act on.
      const source =
        hiddenKind === "draft"
          ? overview({ draft: true })
          : overview({ mergeable: null });
      expect(mergeBlocker(source)?.kind).toBe(hiddenKind);
      expect(headerBlocker(source)).toBeNull();
    },
  );

  test.each([
    ["dirty", "conflicts"],
    ["unstable", "unmergeable"],
  ])("a %s branch keeps its header badge", (mergeableState, kind) => {
    expect(
      headerBlocker(overview({ mergeable: false, mergeableState }))?.kind,
    ).toBe(kind);
  });

  test.each([
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

  test("the worst outcome wins over any number of better ones", () => {
    // Summarising twenty green checks and one red one as "success" is how a
    // broken branch reads as ready to merge.
    expect(
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
        countChecks([
          check({}),
          check({ status: "in_progress", conclusion: null }),
        ]),
      ),
    ).toBe("1 in progress · 1 passing");
  });

  test("a skipped-only run does not claim everything passed", () => {
    expect(
      checksHeadline(countChecks([check({ conclusion: "skipped" })])),
    ).toBe("1 skipped");
  });

  test("the list puts failures first and keeps GitHub's order within a tone", () => {
    const sorted = checksWorstFirst([
      check({ name: "lint" }),
      check({ name: "skipped", conclusion: "skipped" }),
      check({ name: "typecheck", conclusion: "failure" }),
      check({ name: "e2e", status: "in_progress", conclusion: null }),
      check({ name: "build" }),
      check({ name: "timeout", conclusion: "timed_out" }),
    ]);
    expect(sorted.map((c) => c.name)).toEqual([
      "typecheck",
      "timeout",
      "e2e",
      "lint",
      "build",
      "skipped",
    ]);
  });
});
