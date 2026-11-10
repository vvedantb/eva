import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type * as GithubAuth from "../convex/githubAuth";

/**
 * The Reviews writes and list read that both the web and the phone review
 * screens call (apps/mobile has no wrapper: it calls these actions as the web
 * does). GitHub is faked at `getInstallationOctokit`, so each test checks what
 * would be sent to GitHub, and that a caller without the repo sends nothing.
 */

const github = vi.hoisted(() => ({
  list: vi.fn(),
  createReview: vi.fn(),
  merge: vi.fn(),
  createComment: vi.fn(),
  // No stack: the merge goes through `pulls.merge`.
  graphql: vi.fn(),
}));

vi.mock("../convex/githubAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof GithubAuth>()),
  getInstallationOctokit: async () => ({
    rest: {
      pulls: { list: github.list, createReview: github.createReview, merge: github.merge },
      issues: { createComment: github.createComment },
    },
    graphql: github.graphql,
  }),
}));

const modules = import.meta.glob("../convex/**/*.ts");
const CLERK_ID = "clerk|pr-review";
const TIMEOUT_MS = 30_000;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const strangerId = await ctx.db.insert("users", {});
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "acme",
      name: "widgets",
      installationId: 1,
      connectedBy: userId,
    });
    const strangerRepoId = await ctx.db.insert("githubRepos", {
      owner: "someone",
      name: "else",
      installationId: 2,
      connectedBy: strangerId,
    });
    return { repoId, strangerRepoId };
  });
  return { ids, asUser: t.withIdentity({ subject: CLERK_ID }) };
}

describe("pull request review actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    github.graphql.mockResolvedValue(null);
  });

  test(
    "lists the repo's pull requests, recently updated first, in the row shape",
    async () => {
      const { ids, asUser } = await fixture();
      github.list.mockResolvedValue({
        data: [
          {
            number: 12,
            title: "Add widgets",
            state: "open",
            draft: true,
            user: { login: "octocat" },
            updated_at: "2026-11-10T10:00:00Z",
            created_at: "2026-11-09T10:00:00Z",
            html_url: "https://github.com/acme/widgets/pull/12",
          },
        ],
      });

      const rows = await asUser.action(api.github.listPullRequests, { repoId: ids.repoId, state: "closed" });

      expect(github.list).toHaveBeenCalledWith(
        expect.objectContaining({ owner: "acme", repo: "widgets", state: "closed", sort: "updated", direction: "desc" }),
      );
      expect(rows).toEqual([
        {
          number: 12,
          title: "Add widgets",
          state: "open",
          draft: true,
          authorLogin: "octocat",
          updatedAt: "2026-11-10T10:00:00Z",
          createdAt: "2026-11-09T10:00:00Z",
          htmlUrl: "https://github.com/acme/widgets/pull/12",
        },
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "an approval with no summary and no line comments sends neither",
    async () => {
      const { ids, asUser } = await fixture();
      github.createReview.mockResolvedValue({
        data: { id: 7, html_url: "https://github.com/acme/widgets/pull/12#pullrequestreview-7", state: "APPROVED" },
      });

      const result = await asUser.action(api.github.submitPrReview, {
        repoId: ids.repoId,
        prNumber: 12,
        event: "APPROVE",
        body: "  ",
        comments: [],
      });

      expect(github.createReview).toHaveBeenCalledWith({
        owner: "acme",
        repo: "widgets",
        pull_number: 12,
        event: "APPROVE",
        body: undefined,
        comments: undefined,
      });
      expect(result).toEqual({
        reviewId: 7,
        htmlUrl: "https://github.com/acme/widgets/pull/12#pullrequestreview-7",
        state: "APPROVED",
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a changes-requested review carries its trimmed summary",
    async () => {
      const { ids, asUser } = await fixture();
      github.createReview.mockResolvedValue({ data: { id: 8, html_url: "https://example.test/r/8", state: "CHANGES_REQUESTED" } });

      await asUser.action(api.github.submitPrReview, {
        repoId: ids.repoId,
        prNumber: 12,
        event: "REQUEST_CHANGES",
        body: "  Rename the helper.\n",
        comments: [],
      });

      expect(github.createReview).toHaveBeenCalledWith(
        expect.objectContaining({ event: "REQUEST_CHANGES", body: "Rename the helper." }),
      );
    },
    TIMEOUT_MS,
  );

  test(
    "a conversation comment is trimmed, and an empty one never reaches GitHub",
    async () => {
      const { ids, asUser } = await fixture();
      github.createComment.mockResolvedValue({ data: { id: 9, html_url: "https://example.test/c/9" } });

      const posted = await asUser.action(api.github.addPrComment, { repoId: ids.repoId, prNumber: 12, body: " Looks good \n" });
      expect(posted).toEqual({ id: 9, htmlUrl: "https://example.test/c/9" });
      expect(github.createComment).toHaveBeenCalledWith({ owner: "acme", repo: "widgets", issue_number: 12, body: "Looks good" });

      github.createComment.mockClear();
      await expect(asUser.action(api.github.addPrComment, { repoId: ids.repoId, prNumber: 12, body: "   " })).rejects.toThrow(
        "Comment cannot be empty",
      );
      expect(github.createComment).not.toHaveBeenCalled();
    },
    TIMEOUT_MS,
  );

  test(
    "a merge sends the chosen method and returns GitHub's message",
    async () => {
      const { ids, asUser } = await fixture();
      github.merge.mockResolvedValue({ data: { merged: true, sha: "abc123", message: "Pull Request successfully merged" } });

      const result = await asUser.action(api.github.mergePullRequest, { repoId: ids.repoId, prNumber: 12, method: "rebase" });

      expect(github.merge).toHaveBeenCalledWith({ owner: "acme", repo: "widgets", pull_number: 12, merge_method: "rebase" });
      expect(result).toEqual({ merged: true, sha: "abc123", message: "Pull Request successfully merged" });
    },
    TIMEOUT_MS,
  );

  test(
    "a caller without the repo is refused before anything is sent",
    async () => {
      const { ids, asUser } = await fixture();
      const repoId = ids.strangerRepoId;

      await expect(
        asUser.action(api.github.submitPrReview, { repoId, prNumber: 1, event: "APPROVE", body: "", comments: [] }),
      ).rejects.toThrow("Not authorized");
      await expect(asUser.action(api.github.addPrComment, { repoId, prNumber: 1, body: "Hi" })).rejects.toThrow("Not authorized");
      await expect(asUser.action(api.github.mergePullRequest, { repoId, prNumber: 1, method: "squash" })).rejects.toThrow(
        "Not authorized",
      );
      expect(github.createReview).not.toHaveBeenCalled();
      expect(github.createComment).not.toHaveBeenCalled();
      expect(github.merge).not.toHaveBeenCalled();
    },
    TIMEOUT_MS,
  );
});
