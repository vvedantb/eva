import { describe, expect, test } from "vitest";
import { GITHUB_AUTH_REQUIRED } from "../convex/_github/authErrors";
import { classifyContentFetchFailure } from "../convex/_github/prDiff";
import {
  GITHUB_RATE_LIMITED,
  INSTALLATION_NOT_AUTHORIZED,
  classifyInstallationReposFailure,
} from "../convex/_github/userAuth";

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
 * The failures both call sites have to tell apart. The three throttled entries
 * are the point: every one of them used to be indistinguishable from the plain
 * 403 sitting next to it.
 */
const forbidden = new RequestErrorLike("Forbidden", 403);
const forbiddenWithBudgetLeft = new RequestErrorLike("Forbidden", 403, {
  "x-ratelimit-remaining": "42",
});
const throttledByMessage = new RequestErrorLike(
  "API rate limit exceeded for installation",
  403,
);
const throttledByHeader = new RequestErrorLike("Forbidden", 403, {
  "x-ratelimit-remaining": "0",
});
const tooManyRequests = new RequestErrorLike("Too Many Requests", 429);
const notFound = new RequestErrorLike("Not Found", 404);
const serverError = new RequestErrorLike("Internal Server Error", 500);

describe("classifyInstallationReposFailure", () => {
  test.each([
    ["a plain 403", forbidden, "not-authorized"],
    ["a 403 with budget left", forbiddenWithBudgetLeft, "not-authorized"],
    ["a 404", notFound, "not-authorized"],
    ["a 403 rate limit by message", throttledByMessage, "rate-limited"],
    ["a 403 with no budget left", throttledByHeader, "rate-limited"],
    ["a 429", tooManyRequests, "rate-limited"],
    ["a 500", serverError, "rethrow"],
    ["a plain Error", new Error("socket hang up"), "rethrow"],
  ] as const)("maps %s", (_label, error, expected) => {
    expect(classifyInstallationReposFailure(error)).toBe(expected);
  });

  /**
   * The behaviour change: a throttled 403 used to be folded into the 403/404
   * "not authorized" branch, telling the user their access was the problem.
   */
  test("no longer calls throttling an authorization failure", () => {
    expect(classifyInstallationReposFailure(throttledByHeader)).not.toBe(
      classifyInstallationReposFailure(forbidden),
    );
  });

  /**
   * The web offers the GitHub authorize hop by matching GITHUB_AUTH_REQUIRED in
   * the message, so a retryable outcome must not read as a credentials problem.
   */
  test("the throttling message cannot be mistaken for an auth failure", () => {
    expect(GITHUB_RATE_LIMITED).toBe(
      "GitHub rate limit reached — try again in a minute",
    );
    expect(GITHUB_RATE_LIMITED).not.toContain(GITHUB_AUTH_REQUIRED);
    expect(GITHUB_RATE_LIMITED).not.toContain("Not authorized");
    expect(INSTALLATION_NOT_AUTHORIZED).toBe(
      "Not authorized to inspect this installation",
    );
  });
});

describe("classifyContentFetchFailure", () => {
  test.each([
    ["a 404", notFound, "not-found"],
    ["a plain 403", forbidden, "too-large"],
    ["a 403 with budget left", forbiddenWithBudgetLeft, "too-large"],
    ["a 403 rate limit by message", throttledByMessage, "rethrow"],
    ["a 403 with no budget left", throttledByHeader, "rethrow"],
    ["a 429", tooManyRequests, "rethrow"],
    ["a 500", serverError, "rethrow"],
    ["a plain Error", new Error("socket hang up"), "rethrow"],
  ] as const)("maps %s", (_label, error, expected) => {
    expect(classifyContentFetchFailure(error)).toBe(expected);
  });

  /**
   * The behaviour change, and why it matters more here than anywhere else: the
   * answer is written to an ActionCache keyed by commit sha, so "too-large" for
   * a throttled read would stick as a permanent verdict about the file.
   */
  test("throttling never resolves to a cacheable verdict", () => {
    for (const throttled of [
      throttledByMessage,
      throttledByHeader,
      tooManyRequests,
    ]) {
      expect(classifyContentFetchFailure(throttled)).toBe("rethrow");
    }
    expect(classifyContentFetchFailure(forbidden)).toBe("too-large");
  });
});
