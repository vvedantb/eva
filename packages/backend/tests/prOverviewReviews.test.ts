import { expect, test } from "bun:test";
import { latestReviewPerAuthor } from "../convex/_github/prOverview";

test("latestReviewPerAuthor drops the review event body field", () => {
  const [review] = latestReviewPerAuthor([
    {
      id: 1,
      authorLogin: "octocat",
      authorAvatarUrl: "https://example.com/avatar.png",
      state: "APPROVED",
      submittedAt: "2026-09-02T09:31:00Z",
      htmlUrl: "https://github.com/vvedantb/eva/pull/698#pullrequestreview-1",
      body: "",
    },
  ]);

  expect(review).toBeDefined();
  expect(review).not.toHaveProperty("body");
  expect(Object.keys(review ?? {}).toSorted()).toEqual(
    [
      "authorAvatarUrl",
      "authorLogin",
      "htmlUrl",
      "id",
      "state",
      "submittedAt",
    ].toSorted(),
  );
});

test("latestReviewPerAuthor keeps a non-empty body from bleeding into the sidebar shape", () => {
  const [review] = latestReviewPerAuthor([
    {
      id: 2,
      authorLogin: "reviewer",
      authorAvatarUrl: null,
      state: "CHANGES_REQUESTED",
      submittedAt: "2026-09-02T09:31:00Z",
      htmlUrl: "https://github.com/vvedantb/eva/pull/698#pullrequestreview-2",
      body: "Please fix the validator.",
    },
  ]);

  expect(review).not.toHaveProperty("body");
});
