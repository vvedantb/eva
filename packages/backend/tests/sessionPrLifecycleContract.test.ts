import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const source = stripComments(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../convex/githubWebhook.ts"),
    "utf8",
  ),
);
const derive = functionBody(source, "function deriveSessionPrState(");
const handler = definitionBody(source, "handleSessionPrEvent");
// The archive/unarchive side effects moved into a helper so the linked-repo PR
// path (multi-repo sessions open one PR per `sessionRepos` row) archives
// through the same code; the lifecycle contract lives there now.
const reconcile = functionBody(
  source,
  "async function reconcileSessionArchiveState(",
);

describe("session pull-request lifecycle", () => {
  test("distinguishes merged closes from unmerged closes", () => {
    expect(derive).toContain('return merged ? "merged" : "closed"');
  });

  test("maps draft, ready, open and reopen events", () => {
    expect(derive).toContain('action === "converted_to_draft"');
    expect(derive).toContain('action === "ready_for_review"');
    expect(derive).toContain('action === "opened" || action === "reopened"');
  });

  test("both PR paths reconcile the archive state through one helper", () => {
    // Primary-PR path and linked-repo path, so a multi-repo session archives
    // exactly once — when every PR it opened is terminal.
    expect(handler.match(/reconcileSessionArchiveState\(/g)).toHaveLength(2);
  });

  test("archives both terminal states and unarchives every live state", () => {
    // Which PR states count as terminal — and how a session's linked PRs
    // combine with its primary — is `shouldArchiveSession` (see
    // prArchiveRule.test.ts), not a condition inlined here.
    expect(reconcile).toContain("shouldArchiveSession(");
    expect(reconcile).toContain("archived: needsArchive");
    expect(reconcile).toContain("prStateOnArchive: undefined");
  });

  test("stops a terminal session before scheduling its grace deletion", () => {
    const stopAt = reconcile.indexOf("requestSessionSandboxStop(");
    const deleteAt = reconcile.indexOf("scheduleSessionSandboxGraceDelete(");
    expect(stopAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(stopAt);
  });

  test("only schedules deletion for a newly archived session", () => {
    expect(reconcile).toContain(
      "const needsArchive = archive && session.archived !== true",
    );
    expect(reconcile).toContain("if (needsArchive) {");
  });

  test("reopen cancels an already scheduled deletion", () => {
    expect(reconcile).toContain(
      "const needsUnarchive = !archive && session.archived === true",
    );
    expect(reconcile).toContain("cancelSessionSandboxGraceDelete(");
  });

  test("merged verification is fenced by PR number and merge SHA", () => {
    const verifyAt = handler.indexOf("internal.github.verifySessionPrMerged");
    expect(verifyAt).toBeGreaterThan(-1);
    const gate = handler.slice(Math.max(0, verifyAt - 500), verifyAt);
    expect(gate).toContain('nextState === "merged"');
    expect(gate).toContain("args.prNumber !== undefined");
    expect(gate).toContain("args.mergeCommitSha !== undefined");
  });

  test("a newly archived session notifies the owner in-app", () => {
    const archiveAt = reconcile.indexOf("if (needsArchive) {");
    const notifyAt = reconcile.indexOf("notifySessionOwnerOfPrArchive(");
    expect(archiveAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeGreaterThan(archiveAt);
    expect(reconcile.slice(archiveAt, notifyAt)).not.toContain(
      "needsUnarchive",
    );
  });
});

describe("session archive closes a live PR", () => {
  const mutations = stripComments(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../convex/_sessions/mutations.ts",
      ),
      "utf8",
    ),
  );
  const archive = definitionBody(mutations, "archive");
  const unarchive = definitionBody(mutations, "unarchive");
  // The archive body moved into a helper so `resetOrchestratorSession` retires
  // the old master through the same path; the PR contract lives there now.
  const archiveDoc = functionBody(
    mutations,
    "export async function archiveSessionDoc",
  );

  test("archive closes open/draft PRs and remembers that state", () => {
    expect(archiveDoc).toContain("livePrState(session.prState)");
    expect(archiveDoc).toContain('kind: "close"');
    expect(archiveDoc).toContain("prStateOnArchive: restorePrState");
    expect(archiveDoc).not.toContain("reopenPullRequest");
  });

  test("the archive mutation has no second copy of that contract", () => {
    expect(archive).toContain("archiveSessionDoc(ctx, session)");
    expect(archive).not.toContain("livePrState(");
  });

  test("unarchive reopens only a PR Eva closed, skipping merged", () => {
    expect(unarchive).toContain("livePrState(session.prStateOnArchive)");
    expect(unarchive).toContain('session.prState !== "merged"');
    expect(unarchive).toContain('kind: "reopen"');
    expect(unarchive).toContain('asReady: restorePrState === "open"');
  });
});

function definitionBody(input: string, name: string): string {
  const startAt = input.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = input.indexOf("\n});", startAt);
  return input.slice(startAt, endAt < 0 ? undefined : endAt);
}

function functionBody(input: string, declaration: string): string {
  const startAt = input.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = input.indexOf("\n}", startAt);
  return input.slice(startAt, endAt < 0 ? undefined : endAt);
}

function stripComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
