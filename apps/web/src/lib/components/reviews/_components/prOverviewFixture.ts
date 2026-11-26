import type { PrOverview } from "./prOverviewMeta";

const BASE_OVERVIEW: PrOverview = {
  number: 1,
  title: "Add feature",
  status: "open",
  draft: false,
  body: null,
  authorLogin: "octocat",
  authorAvatarUrl: null,
  htmlUrl: "https://github.com/eva/eva/pull/1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  headRef: "feature",
  baseRef: "main",
  headSha: "headsha",
  changedFiles: 1,
  additions: 1,
  deletions: 0,
  commitCount: 0,
  commits: [],
  commitsTruncated: false,
  mergeable: true,
  mergeableState: "clean",
  mergedAt: null,
  mergedByLogin: null,
  mergeCommitSha: null,
  previews: [],
  labels: [],
  reviews: [],
  reviewEvents: [],
  requestedReviewers: [],
  assignees: [],
  checks: [],
  checksTruncated: false,
  comments: [],
  commentsTruncated: false,
  stack: null,
};

export function overview(partial: Partial<PrOverview>): PrOverview {
  return { ...BASE_OVERVIEW, ...partial };
}
