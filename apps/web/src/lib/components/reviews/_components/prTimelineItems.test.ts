import { describe, expect, test } from "vitest";
import { buildPrTimeline, groupTimelineRows } from "./prTimelineItems";
import { overview } from "./prOverviewFixture";
import type { PrComment, PrCommit, PrReviewEvent } from "./prOverviewMeta";

const BASE_COMMIT: PrCommit = {
  sha: "sha0",
  message: "Initial commit",
  authorLogin: "octocat",
  authorAvatarUrl: null,
  committedAt: "2026-01-01T00:00:00.000Z",
  htmlUrl: "https://github.com/eva/eva/commit/sha0",
};

const BASE_REVIEW_EVENT: PrReviewEvent = {
  id: 0,
  authorLogin: "reviewer",
  authorAvatarUrl: null,
  state: "COMMENTED",
  submittedAt: "2026-01-01T00:00:00.000Z",
  htmlUrl: "https://github.com/eva/eva/pull/1#pullrequestreview-0",
  body: "",
};

const BASE_COMMENT: PrComment = {
  id: 0,
  kind: "issue",
  body: "Comment body",
  authorLogin: "commenter",
  authorAvatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  htmlUrl: "https://github.com/eva/eva/pull/1#issuecomment-0",
};

function commit(partial: Partial<PrCommit>): PrCommit {
  return { ...BASE_COMMIT, ...partial };
}

function reviewEvent(partial: Partial<PrReviewEvent>): PrReviewEvent {
  return { ...BASE_REVIEW_EVENT, ...partial };
}

function comment(partial: Partial<PrComment>): PrComment {
  return { ...BASE_COMMENT, ...partial };
}

/** Timestamp helper — the timeline only cares about relative order, not real dates. */
function at(ms: number): string {
  return new Date(ms).toISOString();
}

describe("buildPrTimeline", () => {
  test("orders events ascending, opening first, ties on commit-verdict-remark", () => {
    const commitAtOne = commit({ sha: "commitB", committedAt: at(1000) });
    const reviewAtOne = reviewEvent({
      id: 1,
      submittedAt: at(1000),
      state: "COMMENTED",
      body: "nice",
    });
    const commentAtOne = comment({ id: 50, kind: "issue", createdAt: at(1000) });
    const reviewAtTwo = reviewEvent({
      id: 2,
      submittedAt: at(2000),
      state: "APPROVED",
      body: "",
    });
    const commitAtThree = commit({ sha: "commitA", committedAt: at(3000) });

    const timeline = buildPrTimeline(
      overview({
        createdAt: at(500),
        commits: [commitAtThree, commitAtOne],
        reviewEvents: [reviewAtTwo, reviewAtOne],
        comments: [commentAtOne],
      }),
    );

    expect(timeline.map((event) => event.key)).toEqual([
      "opened",
      "commit-commitB",
      "review-1",
      "comment-issue-50",
      "review-2",
      "commit-commitA",
    ]);
  });

  test("a verdict is its own event and goes stale once commits land after it", () => {
    const timeline = buildPrTimeline(
      overview({
        commits: [commit({ sha: "late", committedAt: at(3000) })],
        reviewEvents: [
          reviewEvent({ id: 5, state: "APPROVED", submittedAt: at(2000) }),
        ],
      }),
    );
    const verdict = timeline.find((event) => event.kind === "verdict");
    if (verdict?.kind !== "verdict") throw new Error("Expected a verdict");
    expect(verdict.stale).toBe(true);
  });

  test("drops the empty shell a COMMENTED review leaves behind", () => {
    const timeline = buildPrTimeline(
      overview({
        reviewEvents: [reviewEvent({ id: 9, state: "COMMENTED", body: " " })],
      }),
    );
    expect(timeline.map((event) => event.kind)).toEqual(["opened"]);
  });

  test("a merged pull request ends on the merge", () => {
    const timeline = buildPrTimeline(
      overview({
        status: "merged",
        createdAt: at(0),
        mergedAt: at(9000),
        mergedByLogin: "maintainer",
        commits: [commit({ committedAt: at(1000) })],
      }),
    );
    expect(timeline[timeline.length - 1]).toEqual({
      kind: "merged",
      key: "merged",
      at: 9000,
      actor: "maintainer",
    });
  });
});

describe("groupTimelineRows", () => {
  test("folds adjacent remarks into one conversation, split by anything else", () => {
    const rows = groupTimelineRows(
      buildPrTimeline(
        overview({
          createdAt: at(0),
          comments: [
            comment({ id: 1, createdAt: at(1000) }),
            comment({ id: 2, createdAt: at(2000) }),
            comment({ id: 3, createdAt: at(4000) }),
          ],
          commits: [commit({ sha: "mid", committedAt: at(3000) })],
        }),
      ),
    );

    expect(rows.map((row) => row.kind)).toEqual([
      "event",
      "conversation",
      "event",
      "conversation",
    ]);
    const [, first] = rows;
    if (first?.kind !== "conversation") throw new Error("Expected a conversation");
    expect(first.events.map((event) => event.key)).toEqual([
      "comment-issue-1",
      "comment-issue-2",
    ]);
  });
});
