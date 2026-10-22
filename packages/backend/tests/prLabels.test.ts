import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  hasLegacyDraftLabel,
  sessionPullRequestLabels,
  taskPullRequestLabels,
} from "../convex/_github/prLabels";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

/**
 * Draft is a PR status, not a label. vvedantb/eva#995 kept a stale `draft`
 * label after it went ready for review, which misled label-based automation.
 */

test("session PRs never get a draft label", () => {
  expect(sessionPullRequestLabels("apps/web")).toEqual([
    "eva",
    "session",
    "web",
  ]);
  expect(sessionPullRequestLabels(undefined)).toEqual(["eva", "session"]);
  expect(sessionPullRequestLabels("")).toEqual(["eva", "session"]);
});

test("task and project PRs never get a draft label", () => {
  expect(
    taskPullRequestLabels({ rootDirectory: "apps/web", isQuickTask: true }),
  ).toEqual(["eva", "quick-task", "web"]);
  expect(
    taskPullRequestLabels({ rootDirectory: "", isQuickTask: false }),
  ).toEqual(["eva", "project"]);
});

test("detects a leftover draft label so ready-for-review can remove it", () => {
  expect(hasLegacyDraftLabel([{ name: "eva" }, { name: "draft" }])).toBe(true);
  expect(hasLegacyDraftLabel([{ name: "eva" }, { name: "session" }])).toBe(
    false,
  );
  expect(hasLegacyDraftLabel([])).toBe(false);
});

/**
 * The helpers above only help if every PR create goes through them and the
 * ready-for-review paths actually clear the old label (vvedantb/eva#997).
 */
describe("ready-for-review clears the legacy draft label", () => {
  const taskActions = readSource("taskWorkflowActions.ts");
  const draftState = readSource("_github/pullRequestDraftState.ts");

  test("PR creates build labels from the shared helpers, not inline arrays", () => {
    for (const [file, source] of [
      ["_github/prFlow.ts", readSource("_github/prFlow.ts")],
      ["taskWorkflowActions.ts", taskActions],
    ]) {
      expect(source, `${file} builds an inline labels array`).not.toMatch(
        /labels:\s*\[/,
      );
    }
  });

  /**
   * Most old PRs are already ready, so a removal after the early return would
   * never run for them.
   */
  test("mark-ready removes the label before the already-ready early return", () => {
    const body = definitionBody(taskActions, "markPrReadyForReview");
    const removeAt = body.indexOf("removeLegacyDraftLabel(");
    const earlyReturnAt = body.indexOf("if (!pr.draft) return true;");
    expect(removeAt, "the label removal moved").toBeGreaterThan(-1);
    expect(earlyReturnAt, "the already-ready return moved").toBeGreaterThan(-1);
    expect(removeAt).toBeLessThan(earlyReturnAt);
  });

  test("reopen as ready removes the label", () => {
    expect(definitionBody(taskActions, "reopenPullRequest")).toMatch(
      /if \(args\.asReady\)\s*await removeLegacyDraftLabel\(/,
    );
  });

  /** A failed label removal must not block marking the PR ready. */
  test("label removal is best-effort and never throws", () => {
    const body = definitionBody(
      draftState,
      "export async function removeLegacyDraftLabel(",
    );
    const tryAt = body.indexOf("try {");
    const removeAt = body.indexOf("issues.removeLabel(");
    const catchAt = body.indexOf("} catch (error) {");
    expect(tryAt, "the try moved").toBeGreaterThan(-1);
    expect(removeAt).toBeGreaterThan(tryAt);
    expect(catchAt).toBeGreaterThan(removeAt);
    expect(body.slice(catchAt)).not.toContain("throw");
  });
});

/** Comments name the calls these rules check, so they are removed first. */
function readSource(relativePath: string): string {
  return readFileSync(join(convexDir, relativePath), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/**
 * One Convex definition (`name`) or exported function (`declaration`),
 * ending on the line that closes it.
 */
function definitionBody(source: string, nameOrDeclaration: string): string {
  const marker = nameOrDeclaration.includes(" ")
    ? nameOrDeclaration
    : `export const ${nameOrDeclaration} =`;
  const startAt = source.indexOf(marker);
  expect(startAt, `${nameOrDeclaration} moved or was renamed`).toBeGreaterThan(
    -1,
  );
  const end = source.indexOf("\n}", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}
