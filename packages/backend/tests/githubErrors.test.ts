import { Effect, Exit } from "effect";
import { describe, expect, test } from "vitest";
import {
  GitHubBranchNotAhead,
  classifyGitHubFailure,
  githubRequest,
  originalGitHubError,
} from "../convex/_github/githubErrors";
import {
  isBranchNotAheadError,
  isPullRequestAlreadyExistsError,
} from "../convex/_github/prErrors";

/** Octokit's `RequestError`: an `Error` with the status and response attached. */
class RequestErrorLike extends Error {
  status: number;
  response?: { headers: Record<string, string> };

  constructor(
    message: string,
    status: number,
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    if (headers) this.response = { headers };
  }
}

/**
 * One representative of every failure the PR pipelines can meet. The 422s are
 * the reason message rules run first: nothing in their status tells them apart
 * from a create GitHub simply refused.
 */
const corpus: [label: string, error: unknown, tag: string][] = [
  [
    "422 already exists",
    new RequestErrorLike(
      "Validation Failed: A pull request already exists for eva:eva/foo.",
      422,
    ),
    "GitHubPullRequestAlreadyExists",
  ],
  [
    "422 no commits between",
    new RequestErrorLike(
      "Validation Failed: No commits between main and x",
      422,
    ),
    "GitHubBranchNotAhead",
  ],
  [
    "Eva's own compare sentinel",
    new Error("eva/foo is not ahead of main: every commit is already in main"),
    "GitHubBranchNotAhead",
  ],
  ["404", new RequestErrorLike("Not Found", 404), "GitHubNotFound"],
  ["403", new RequestErrorLike("Forbidden", 403), "GitHubForbidden"],
  ["401", new RequestErrorLike("Bad credentials", 401), "GitHubUnauthorized"],
  [
    "unrelated 500",
    new RequestErrorLike("Internal Server Error", 500),
    "GitHubRequestFailed",
  ],
  [
    "403 rate limit by message",
    new RequestErrorLike("API rate limit exceeded for installation", 403),
    "GitHubRateLimited",
  ],
  [
    "403 secondary rate limit",
    new RequestErrorLike("You have exceeded a secondary rate limit", 403),
    "GitHubRateLimited",
  ],
  [
    "403 with no requests left in the window",
    new RequestErrorLike("Forbidden", 403, { "x-ratelimit-remaining": "0" }),
    "GitHubRateLimited",
  ],
  ["429", new RequestErrorLike("Too Many Requests", 429), "GitHubRateLimited"],
  [
    "403 with requests still left",
    new RequestErrorLike("Forbidden", 403, { "x-ratelimit-remaining": "42" }),
    "GitHubForbidden",
  ],
  ["a plain Error", new Error("socket hang up"), "GitHubRequestFailed"],
  ["a non-Error throw", "kaboom", "GitHubRequestFailed"],
  ["undefined", undefined, "GitHubRequestFailed"],
  [
    "an octokit-shaped plain object",
    { status: 404, message: "Not Found" },
    "GitHubNotFound",
  ],
];

describe("classifyGitHubFailure", () => {
  test.each(corpus)("classifies %s", (_label, error, tag) => {
    expect(classifyGitHubFailure(error)._tag).toBe(tag);
  });

  /**
   * Both non-failures arrive as HTTP 422 validation errors, so a status-first
   * classifier would call them `GitHubRequestFailed` and put the red alert back.
   */
  test("message rules beat status rules", () => {
    const alreadyExists = new RequestErrorLike(
      "A pull request already exists for eva:eva/foo.",
      422,
    );
    expect(classifyGitHubFailure(alreadyExists)._tag).toBe(
      "GitHubPullRequestAlreadyExists",
    );
    // Status is still recorded, it just does not decide the tag.
    expect(classifyGitHubFailure(alreadyExists).status).toBe(422);
  });

  test("keeps the original error as the cause", () => {
    const thrown = new RequestErrorLike("Not Found", 404);
    const failure = classifyGitHubFailure(thrown);
    expect(failure.cause).toBe(thrown);
    expect(originalGitHubError(failure)).toBe(thrown);
  });

  /** Nesting `githubRequest` calls must not bury the cause under a wrapper. */
  test("is idempotent", () => {
    const failure = classifyGitHubFailure(new RequestErrorLike("Nope", 403));
    expect(classifyGitHubFailure(failure)).toBe(failure);
  });
});

/**
 * The compare wait raises this itself, and callers past the Convex action
 * boundary only ever see its message — so the wording, not the tag, is what
 * keeps a plan-only turn from alerting.
 */
describe("the branch-not-ahead sentinel", () => {
  const sentinel = new GitHubBranchNotAhead({
    message: "eva/foo is not ahead of main: every commit is already in main",
    cause: undefined,
  });

  test("is a real Error carrying its message", () => {
    expect(sentinel).toBeInstanceOf(Error);
    expect(sentinel.message).toContain("is not ahead of");
  });

  test("is its own original, so rethrowing keeps the message", () => {
    expect(originalGitHubError(sentinel)).toBe(sentinel);
  });

  test("is recognised after crossing a message-only boundary", () => {
    expect(isBranchNotAheadError(new Error(sentinel.message))).toBe(true);
  });
});

describe("githubRequest", () => {
  test("passes a successful request through", async () => {
    await expect(Effect.runPromise(githubRequest(async () => 7))).resolves.toBe(
      7,
    );
  });

  test("classifies a rejection into the error channel", async () => {
    const thrown = new RequestErrorLike("Not Found", 404);
    const exit = await Effect.runPromiseExit(
      githubRequest(() => Promise.reject(thrown)),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const failure = await Effect.runPromise(
      githubRequest(() => Promise.reject(thrown)).pipe(Effect.flip),
    );
    expect(failure._tag).toBe("GitHubNotFound");
    expect(failure.cause).toBe(thrown);
  });
});

/**
 * The predicates moved from their own regexes to `_tag` checks. Every importer
 * still hands them whatever a `catch` block caught, so the verdicts have to be
 * the ones the regexes gave.
 */
describe("equivalence with the predicates this replaced", () => {
  function oldMessageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function oldIsBranchNotAheadError(error: unknown): boolean {
    const message = oldMessageOf(error);
    return (
      message.includes("is not ahead of") ||
      message.includes("No commits between")
    );
  }

  function oldIsPullRequestAlreadyExistsError(error: unknown): boolean {
    return /pull request already exists/i.test(oldMessageOf(error));
  }

  /** Everything the old bodies could actually read: Errors, strings, nothing. */
  const readable = corpus.filter(
    ([, error]) => error instanceof Error || typeof error !== "object",
  );

  test.each(readable)("isBranchNotAheadError agrees on %s", (_label, error) => {
    expect(isBranchNotAheadError(error)).toBe(oldIsBranchNotAheadError(error));
  });

  test.each(readable)(
    "isPullRequestAlreadyExistsError agrees on %s",
    (_label, error) => {
      expect(isPullRequestAlreadyExistsError(error)).toBe(
        oldIsPullRequestAlreadyExistsError(error),
      );
    },
  );

  test.each([
    ["a bare string", "eva/foo is not ahead of main", true],
    ["undefined", undefined, false],
    ["an unrelated failure", new Error("Bad credentials"), false],
  ])("isBranchNotAheadError handles %s", (_label, error, expected) => {
    expect(isBranchNotAheadError(error)).toBe(expected);
    expect(oldIsBranchNotAheadError(error)).toBe(expected);
  });

  /**
   * The one deliberate widening: an object carrying `message` without being an
   * `Error` used to stringify to "[object Object]" and match nothing. Octokit
   * never throws one, so no caller changes behaviour — but a rehydrated failure
   * from another layer now classifies on the message it does carry.
   */
  test("reads a message off a non-Error object, which the old bodies could not", () => {
    const rehydrated = {
      status: 422,
      message: "A pull request already exists",
    };
    expect(isPullRequestAlreadyExistsError(rehydrated)).toBe(true);
    expect(oldIsPullRequestAlreadyExistsError(rehydrated)).toBe(false);
  });
});
