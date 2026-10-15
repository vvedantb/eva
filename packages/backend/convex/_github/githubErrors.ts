/**
 * Every Octokit failure eva reacts to, classified ONCE into a tagged error.
 *
 * WHY THIS EXISTS
 * The reactions used to be message matches spread across call sites — "is not
 * ahead of" in the compare wait, /pull request already exists/i in the create
 * path, a private zod `{ status }` shape wherever a 404 had to mean "absent".
 * Every new call site re-derived the rules, so they drifted.
 * {@link classifyGitHubFailure} is the only place a GitHub failure is
 * interpreted; callers match on `_tag`.
 *
 * PRECEDENCE
 * Message rules run BEFORE status rules. The two outcomes eva has to treat as
 * non-failures both arrive as HTTP 422 validation errors, indistinguishable by
 * status from any other rejected create.
 *
 * WHAT IS PRESERVED
 * Each failure keeps `cause` — the object Octokit actually threw — so an edge
 * that has to rethrow can hand back the original rather than a wrapper. See
 * {@link originalGitHubError}.
 */

import { Data, Effect } from "effect";
import { z } from "zod";

/** Fields every classified failure carries. `cause` is `undefined` only for
 * sentinels eva raised itself, which are their own original. */
type GitHubFailureFields = {
  message: string;
  cause: unknown;
  status?: number;
};

/**
 * `pulls.create` was rejected because a PR for this branch already exists.
 *
 * Happens when two turns publish at once, or when the pre-create lookup ran
 * before GitHub's list endpoint caught up. Callers re-look-up and adopt that PR
 * rather than reporting a failure.
 */
export class GitHubPullRequestAlreadyExists extends Data.TaggedError(
  "GitHubPullRequestAlreadyExists",
)<GitHubFailureFields> {}

/**
 * A PR cannot be opened because the branch has no commits ahead of base.
 *
 * Plan-only turns push no commits, so this is the ordinary outcome of a
 * conversation that did not touch code. Covers both wordings — eva's own
 * compare sentinel and the message GitHub returns from `pulls.create` — because
 * callers treat them as one outcome: skip the PR, do not alert.
 */
export class GitHubBranchNotAhead extends Data.TaggedError(
  "GitHubBranchNotAhead",
)<GitHubFailureFields> {}

/** GitHub throttled the request. Distinct from {@link GitHubForbidden}: the
 * credentials are fine and the same call will work later. */
export class GitHubRateLimited extends Data.TaggedError(
  "GitHubRateLimited",
)<GitHubFailureFields> {}

/** 401 — the token was rejected. Refreshing or re-authorizing is the only fix. */
export class GitHubUnauthorized extends Data.TaggedError(
  "GitHubUnauthorized",
)<GitHubFailureFields> {}

/** 403 that is not throttling — the installation may not see this resource, or
 * the contents API is refusing a blob over its own size ceiling. */
export class GitHubForbidden extends Data.TaggedError(
  "GitHubForbidden",
)<GitHubFailureFields> {}

/** 404 — absent, or invisible to this installation, which GitHub does not
 * distinguish. */
export class GitHubNotFound extends Data.TaggedError(
  "GitHubNotFound",
)<GitHubFailureFields> {}

/** Everything eva has no specific reaction to. */
export class GitHubRequestFailed extends Data.TaggedError(
  "GitHubRequestFailed",
)<GitHubFailureFields> {}

export type GitHubFailure =
  | GitHubPullRequestAlreadyExists
  | GitHubBranchNotAhead
  | GitHubRateLimited
  | GitHubUnauthorized
  | GitHubForbidden
  | GitHubNotFound
  | GitHubRequestFailed;

/**
 * Octokit's `RequestError` is an `Error` carrying the HTTP status, and the
 * response whose headers say whether GitHub throttled us (verified against
 * `@octokit/request-error@7`: `status: number`, `response?.headers`, where
 * `ResponseHeaders` declares `x-ratelimit-remaining`).
 *
 * Every field is optional so the same shape reads a plain `Error` too.
 */
const requestErrorShape = z.object({
  status: z.number().int().optional(),
  message: z.string().optional(),
  response: z
    .object({
      headers: z
        .object({
          "x-ratelimit-remaining": z.union([z.string(), z.number()]).optional(),
        })
        .optional(),
    })
    .optional(),
});

type GitHubErrorFacts = {
  message: string;
  status: number | undefined;
  rateLimitRemaining: number | undefined;
};

/**
 * The three things the rules are allowed to look at. `String(error)` is the
 * fallback for throws that carry no message at all, which is what the message
 * predicates this module replaced already did.
 */
function readFacts(error: unknown): GitHubErrorFacts {
  const parsed = requestErrorShape.safeParse(error);
  if (!parsed.success) {
    return {
      message: String(error),
      status: undefined,
      rateLimitRemaining: undefined,
    };
  }
  const remaining = parsed.data.response?.headers?.["x-ratelimit-remaining"];
  return {
    message: parsed.data.message ?? String(error),
    status: parsed.data.status,
    rateLimitRemaining: remaining === undefined ? undefined : Number(remaining),
  };
}

/**
 * 429 is throttling by definition. A 403 only counts when GitHub says so —
 * either in the message ("API rate limit exceeded", "secondary rate limit",
 * "abuse detection mechanism") or by reporting no requests left in the window.
 */
function isThrottled(facts: GitHubErrorFacts): boolean {
  if (facts.status === 429) return true;
  if (facts.status !== 403) return false;
  return (
    /rate limit/i.test(facts.message) ||
    /abuse detection/i.test(facts.message) ||
    facts.rateLimitRemaining === 0
  );
}

function isGitHubFailure(error: unknown): error is GitHubFailure {
  return (
    error instanceof GitHubPullRequestAlreadyExists ||
    error instanceof GitHubBranchNotAhead ||
    error instanceof GitHubRateLimited ||
    error instanceof GitHubUnauthorized ||
    error instanceof GitHubForbidden ||
    error instanceof GitHubNotFound ||
    error instanceof GitHubRequestFailed
  );
}

/**
 * The single entry point for "what kind of GitHub failure is this?".
 *
 * Idempotent: an already-classified failure is returned untouched rather than
 * wrapped again, so nesting {@link githubRequest} calls cannot bury a cause.
 */
export function classifyGitHubFailure(error: unknown): GitHubFailure {
  if (isGitHubFailure(error)) return error;

  const facts = readFacts(error);
  const fields = {
    message: facts.message,
    cause: error,
    status: facts.status,
  };

  if (/pull request already exists/i.test(facts.message)) {
    return new GitHubPullRequestAlreadyExists(fields);
  }
  if (
    facts.message.includes("is not ahead of") ||
    facts.message.includes("No commits between")
  ) {
    return new GitHubBranchNotAhead(fields);
  }
  if (isThrottled(facts)) return new GitHubRateLimited(fields);
  if (facts.status === 401) return new GitHubUnauthorized(fields);
  if (facts.status === 403) return new GitHubForbidden(fields);
  if (facts.status === 404) return new GitHubNotFound(fields);
  return new GitHubRequestFailed(fields);
}

/**
 * The boundary every Octokit call belongs behind: one request, one classified
 * failure in the error channel.
 */
export function githubRequest<A>(
  run: () => Promise<A>,
): Effect.Effect<A, GitHubFailure> {
  return Effect.tryPromise({ try: run, catch: classifyGitHubFailure });
}

/**
 * The object a failure was classified from, for edges that rethrow into
 * `async` callers still matching on messages. A sentinel eva raised itself has
 * no cause and is its own original — and carries the message those callers
 * match on.
 */
export function originalGitHubError(failure: GitHubFailure): unknown {
  return failure.cause ?? failure;
}
