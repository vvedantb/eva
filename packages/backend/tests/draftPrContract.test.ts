import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexError } from "convex/values";
import { Effect } from "effect";
import { describe, expect, test, vi } from "vitest";
import { convexErrorPayloadSchema } from "@eva/shared/convexErrorPayload";
import { runActionEffect } from "../convex/_effect/action";
import { GitHubBranchNotAhead } from "../convex/_github/githubErrors";
import {
  classifyPrActionFailure,
  isBranchNotAheadError,
  isPullRequestAlreadyExistsError,
} from "../convex/_github/prErrors";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

const taskActions = readSource("taskWorkflowActions.ts");
const prFlow = readSource("_github/prFlow.ts");

/**
 * A turn that only planned pushes no commits, so opening a PR for its branch is
 * impossible — and used to surface as a red "Failed to create pull request"
 * alert on every such turn (fix cf1ddef3). The branch is skipped instead, which
 * only works if the message the compare step throws is one this predicate
 * recognises.
 */
describe("isBranchNotAheadError", () => {
  test.each([
    ["our own compare sentinel", "eva/foo is not ahead of main"],
    ["GitHub's create error", "No commits between main and eva/foo"],
  ])("recognises %s", (_label, message) => {
    expect(isBranchNotAheadError(new Error(message))).toBe(true);
  });

  test("ignores unrelated failures", () => {
    expect(isBranchNotAheadError(new Error("Bad credentials"))).toBe(false);
  });

  /**
   * The wait timeout is a different failure: GitHub never confirmed the branch,
   * so there may well be commits and the user needs to hear about it. Swallowing
   * it would turn a broken publish into a silent one.
   */
  test("does not recognise the wait timeout", () => {
    const timeout = thrownMessages(
      functionBody(taskActions, "async function waitForPullRequestHead("),
    ).find((message) => message.includes("did not report"));
    expect(timeout, "the wait timeout throw moved").toBeDefined();
    expect(isBranchNotAheadError(new Error(timeout ?? ""))).toBe(false);
  });

  /** Octokit occasionally rejects with a plain string. */
  test("handles a non-Error rejection", () => {
    expect(isBranchNotAheadError("eva/foo is not ahead of main")).toBe(true);
    expect(isBranchNotAheadError(undefined)).toBe(false);
  });

  /**
   * The assertion that actually protects the fix: the predicate and the throw
   * site live in different files, so rewording the sentinel silently brings the
   * false alert back. The literal is read out of the source rather than copied.
   */
  test("recognises the sentinel waitForPullRequestHead actually raises", () => {
    const sentinel = taggedErrorMessage(
      functionBody(taskActions, "async function waitForPullRequestHead("),
      "GitHubBranchNotAhead",
    );
    expect(sentinel, "the not-ahead sentinel moved").toBeDefined();
    expect(isBranchNotAheadError(new Error(sentinel ?? "")), sentinel).toBe(
      true,
    );
  });
});

/**
 * Retrying a compare that GitHub answered cannot produce commits, so the wait
 * loop has to fail on the first not-ahead answer rather than spending its whole
 * delay budget first (fix cf1ddef3).
 */
describe("the wait for a pushed branch fails fast when it is not ahead", () => {
  const body = functionBody(
    taskActions,
    "async function waitForPullRequestHead(",
  );

  test("raises on the first not-ahead compare", () => {
    const successAt = body.indexOf("comparison.data.ahead_by > 0");
    expect(successAt, "the ahead check moved").toBeGreaterThan(-1);
    const raiseAt = body.indexOf("new GitHubBranchNotAhead(", successAt);
    const retryAt = body.indexOf("Effect.retry(", successAt);
    expect(raiseAt, "the not-ahead sentinel moved").toBeGreaterThan(-1);
    expect(
      raiseAt,
      "the sentinel belongs in the attempt, not the retry policy",
    ).toBeLessThan(retryAt);
  });

  /** Its own failure reaches its own retry policy, which must not swallow it. */
  test("the retry policy refuses it instead of retrying", () => {
    const whileAt = body.indexOf("while:");
    expect(whileAt, "the retry predicate moved").toBeGreaterThan(-1);
    expect(body.slice(whileAt), "the sentinel is retryable again").toContain(
      '_tag !== "GitHubBranchNotAhead"',
    );
  });

  /**
   * The wait raises a tagged failure but callers see it across a Convex action
   * boundary, where only the message survives. `GitHubBranchNotAhead` has to
   * stay an `Error` subclass carrying that message, not a plain payload.
   */
  test("the sentinel is still a message-carrying Error", () => {
    const sentinel = new GitHubBranchNotAhead({
      message: "eva/foo is not ahead of main",
      cause: undefined,
    });
    expect(sentinel).toBeInstanceOf(Error);
    expect(isBranchNotAheadError(sentinel)).toBe(true);
    expect(isBranchNotAheadError(new Error(sentinel.message))).toBe(true);
  });

  test("a not-ahead branch skips the draft PR without alerting", () => {
    const body = definitionBody(prFlow, "createDraftSessionPr");
    const guardAt = body.indexOf("isBranchNotAheadError(error)");
    expect(guardAt, "the draft-PR skip moved").toBeGreaterThan(-1);
    const branch = body.slice(guardAt, body.indexOf("throw error;", guardAt));
    expect(branch).toContain("return null;");
    expect(branch, "skipping is not worth a system alert").not.toContain(
      "messages",
    );
  });
});

/**
 * Two turns publishing at once, or a list endpoint that had not caught up, made
 * `pulls.create` fail with "already exists" and reported a broken publish for a
 * PR that existed (fix b666575b).
 */
describe("an existing pull request is adopted, not re-created", () => {
  const body = functionBody(
    taskActions,
    "async function createPullRequestWithGitHub(",
  );

  test.each([
    ["already exists", "A pull request already exists for eva:eva/foo."],
    ["lowercase wording", "pull request already exists"],
  ])("isPullRequestAlreadyExistsError recognises %s", (_label, message) => {
    expect(isPullRequestAlreadyExistsError(new Error(message))).toBe(true);
  });

  test("isPullRequestAlreadyExistsError ignores unrelated failures", () => {
    expect(isPullRequestAlreadyExistsError(new Error("Not Found"))).toBe(false);
  });

  test("looks for an open PR before creating one", () => {
    const lookupAt = body.indexOf("findOpenPullRequestForBranch(args)");
    const createAt = body.indexOf("pulls.create(");
    expect(lookupAt, "the pre-create lookup moved").toBeGreaterThan(-1);
    expect(createAt, "the create call moved").toBeGreaterThan(-1);
    expect(lookupAt).toBeLessThan(createAt);
  });

  /**
   * The lookup can lose the race, so the handler re-looks-up with backoff. A
   * single immediate retry would hit the same stale list.
   */
  test("re-looks-up with backoff before giving up", () => {
    const handlerAt = body.indexOf('_tag === "GitHubPullRequestAlreadyExists"');
    expect(handlerAt, "the already-exists handler moved").toBeGreaterThan(-1);
    const handler = body.slice(handlerAt);
    const delays = handler.match(/retryAfterDelays\(\[([\d, ]+)\]\)/);
    expect(delays, "the re-lookup backoff moved").not.toBeNull();
    const parsed = (delays?.[1] ?? "").split(",").map((part) => Number(part));
    expect(parsed.length).toBeGreaterThan(1);
    expect(
      Math.max(...parsed),
      "waiting 0ms retries the same stale list",
    ).toBeGreaterThan(0);
    expect(handler).toContain("findOpenPullRequestForBranch(args)");
    expect(handler, "an unadoptable failure still surfaces").toContain(
      "Effect.orElseFail(() => failure)",
    );
  });
});

/**
 * A manual "Create PR" that fails has to say why: production Convex redacts a
 * thrown `Error` to "Server Error", so the reason used to be lost. The reason
 * now travels as `ConvexError` data with the failure's tag on it, which is only
 * true while the action runs through the runner rather than rethrowing a bare
 * string payload.
 */
describe("a manual PR failure reaches the user with its tag", () => {
  const body = definitionBody(taskActions, "createTaskPr");

  test("createTaskPr runs its attempt through the runner", () => {
    expect(body).toContain("runActionEffect(");
    expect(body).toContain("visiblePrAttempt(");
  });

  test("no action throws a string-payload ConvexError any more", () => {
    expect(
      taskActions,
      "a string payload gives the web nothing to branch on",
    ).not.toContain("new ConvexError(");
  });

  test("the attempt classifies every failure into the error channel", () => {
    const attempt = functionBody(taskActions, "function visiblePrAttempt<T>(");
    expect(attempt).toContain("Effect.tryPromise(");
    expect(attempt, "a defect would be redacted again").toContain(
      "catch: classifyPrActionFailure",
    );
  });

  /**
   * The sentinel the compare step raises is the failure this whole path exists
   * for — a plan-only turn asked for a PR by hand. It has to arrive tagged, not
   * as prose the web would have to match.
   */
  test("a not-ahead branch crosses as its own tag", async () => {
    const sentinel = new GitHubBranchNotAhead({
      message: "eva/foo is not ahead of main",
      cause: undefined,
    });
    const failure = classifyPrActionFailure(sentinel);
    expect(failure._tag).toBe("GitHubBranchNotAhead");

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const thrown = await runActionEffect(
        Effect.fail(failure),
        "pr createTaskPr task=abc",
      ).catch((error: unknown) => error);
      const payload = convexErrorPayloadSchema.parse(
        thrown instanceof ConvexError ? thrown.data : undefined,
      );
      expect(payload).toEqual({
        tag: "GitHubBranchNotAhead",
        message: "eva/foo is not ahead of main",
      });
    } finally {
      log.mockRestore();
    }
  });

  /** GitHub failures worth branching on keep the tag the classifier gave them. */
  test.each([
    ["a rejected token", 401, "Bad credentials", "GitHubUnauthorized"],
    ["an invisible repo", 404, "Not Found", "GitHubNotFound"],
  ])("%s keeps its specific tag", (_label, status, message, tag) => {
    expect(classifyPrActionFailure(withStatus(message, status))._tag).toBe(tag);
  });

  /**
   * Everything the classifier has no specific answer for still has to stay
   * visible, with the message the old helper would have shown — which was
   * `error.message` for an `Error` and `String(error)` otherwise.
   */
  test.each([
    ["not authenticated", new Error("Not authenticated"), "Not authenticated"],
    [
      "a missing base branch",
      new Error("Base branch not found for repo"),
      "Base branch not found for repo",
    ],
    ["a GitHub 500", withStatus("Server Error", 500), "Server Error"],
    ["a string rejection", "boom", "boom"],
  ])(
    "%s becomes an unexpected failure with its message",
    (_label, error, message) => {
      const failure = classifyPrActionFailure(error);
      expect(failure._tag).toBe("UnexpectedActionFailure");
      expect(failure.message).toBe(message);
    },
  );
});

/** Octokit's `RequestError`: an `Error` carrying the HTTP status. */
function withStatus(message: string, status: number): Error {
  const error = new Error(message);
  return Object.assign(error, { status });
}

/**
 * Comments name the very calls these rules rule out, so they have to go first.
 * Newlines are normalised so multi-line assertions do not depend on checkout
 * line endings.
 */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** Slices from a declaration to the next top-level one. */
function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\n(?:export |async function |function |const )/);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}

/** One Convex definition, ending on the `\n});` that closes it. */
function definitionBody(source: string, name: string): string {
  const startAt = source.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n});", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/**
 * The template literals passed to `new Error(...)`, rendered with each `${…}`
 * replaced by a stand-in so they can be matched as real messages.
 */
function thrownMessages(source: string): string[] {
  return [...source.matchAll(/new Error\(\s*`([^`]*)`/g)].map((match) =>
    renderTemplate(match[1]),
  );
}

/** The `message:` a tagged error is constructed with, rendered the same way. */
function taggedErrorMessage(source: string, tag: string): string | undefined {
  const at = source.indexOf(`new ${tag}(`);
  if (at < 0) return undefined;
  const match = /message:\s*`([^`]*)`/.exec(source.slice(at));
  return match ? renderTemplate(match[1]) : undefined;
}

function renderTemplate(literal: string): string {
  return literal.replace(/\$\{[^}]*\}/g, "x").replaceAll("\n", " ");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
