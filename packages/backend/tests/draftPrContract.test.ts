import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  isBranchNotAheadError,
  isPullRequestAlreadyExistsError,
} from "../convex/_github/prErrors";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

const taskActions = readSource("_github/pullRequestWrite.ts");
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
  test("recognises the sentinel waitForPullRequestHead actually throws", () => {
    const sentinel = thrownMessages(
      functionBody(taskActions, "async function waitForPullRequestHead("),
    ).find((message) => !message.includes("did not report"));
    expect(sentinel, "the not-ahead throw moved").toBeDefined();
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

  test("throws on the first not-ahead compare", () => {
    const successAt = body.indexOf("comparison.data.ahead_by > 0");
    expect(successAt, "the ahead check moved").toBeGreaterThan(-1);
    const throwAt = body.indexOf("is not ahead of", successAt);
    const catchAt = body.indexOf("} catch (error) {", successAt);
    expect(throwAt, "the not-ahead throw moved").toBeGreaterThan(-1);
    expect(
      throwAt,
      "the throw belongs in the try, not the handler",
    ).toBeLessThan(catchAt);
  });

  /** Its own throw lands in its own catch, which must not swallow it. */
  test("the handler rethrows it instead of retrying", () => {
    const catchAt = body.indexOf("} catch (error) {");
    const handler = body.slice(catchAt);
    const guardAt = handler.indexOf('includes("is not ahead of")');
    expect(guardAt, "the rethrow guard moved").toBeGreaterThan(-1);
    expect(handler.indexOf("throw error;", guardAt)).toBeGreaterThan(guardAt);
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
    const handlerAt = body.indexOf("isPullRequestAlreadyExistsError(error)");
    expect(handlerAt, "the already-exists handler moved").toBeGreaterThan(-1);
    const handler = body.slice(handlerAt);
    const delays = handler.match(/for \(const delayMs of \[([\d, ]+)\]\)/);
    expect(delays, "the re-lookup backoff moved").not.toBeNull();
    const parsed = (delays?.[1] ?? "").split(",").map((part) => Number(part));
    expect(parsed.length).toBeGreaterThan(1);
    expect(
      Math.max(...parsed),
      "waiting 0ms retries the same stale list",
    ).toBeGreaterThan(0);
    expect(handler).toContain("findOpenPullRequestForBranch(args)");
    expect(handler, "an unadoptable failure still surfaces").toContain(
      "throw error;",
    );
  });
});

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
    match[1].replace(/\$\{[^}]*\}/g, "x").replaceAll("\n", " "),
  );
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
