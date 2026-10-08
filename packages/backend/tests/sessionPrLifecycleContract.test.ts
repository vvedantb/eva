import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const webhook = readSource("githubWebhook.ts");
const handler = definitionBody(webhook, "handlePullRequestEvent");
const prArchive = readSource("_sessions/prArchive.ts");
// Every PR state change re-checks the session's archive rule through this one
// helper, over every PR the session holds.
const reconcile = functionBody(
  prArchive,
  "export async function reconcileSessionArchiveState(",
);
const store = readSource("_pullRequests/store.ts");

describe("session pull-request lifecycle", () => {
  test("the webhook updates the PR row before the owner reacts", () => {
    const rowAt = handler.indexOf("setPullRequestState(");
    const reactAt = handler.indexOf("reconcileSessionArchiveState(");
    expect(rowAt).toBeGreaterThan(-1);
    expect(reactAt).toBeGreaterThan(rowAt);
  });

  test("the archive rule reads every PR the session holds", () => {
    expect(reconcile).toContain("listOwnerPullRequests(");
    expect(reconcile).toContain("shouldArchiveSession(");
    expect(reconcile).toContain("archived: needsArchive");
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
    expect(reconcile).toContain("clearArchivedPrStates(");
  });

  test("merged verification is fenced by the transition and merge SHA", () => {
    const verifyAt = handler.indexOf("internal.github.verifySessionPrMerged");
    expect(verifyAt).toBeGreaterThan(-1);
    const gate = handler.slice(Math.max(0, verifyAt - 500), verifyAt);
    expect(gate).toContain('nextState === "merged"');
    expect(gate).toContain("args.mergeCommitSha !== undefined");
    // A duplicate merged webhook must not re-schedule the check.
    expect(handler).toContain(
      "if (nextState === null || nextState === previousState) return null;",
    );
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

describe("session archive closes every live PR", () => {
  const mutations = readSource("_sessions/mutations.ts");
  const archive = definitionBody(mutations, "archive");
  const unarchive = definitionBody(mutations, "unarchive");
  // The archive body lives in a helper so `resetOrchestratorSession` retires
  // the old master through the same path.
  const archiveDoc = functionBody(
    mutations,
    "export async function archiveSessionDoc",
  );
  const close = functionBody(
    store,
    "export async function closeLivePullRequests(",
  );
  const reopen = functionBody(
    store,
    "export async function reopenArchivedPullRequests(",
  );

  test("archive closes every open/draft PR and remembers its state", () => {
    expect(archiveDoc).toContain("closeLivePullRequests(");
    expect(close).toContain("isLivePrState(row.state)");
    expect(close).toContain('kind: "close"');
    expect(close).toContain("stateOnArchive: row.state");
  });

  test("the archive mutation has no second copy of that contract", () => {
    expect(archive).toContain("archiveSessionDoc(ctx, session)");
    expect(archive).not.toContain("closeLivePullRequests(");
  });

  test("unarchive reopens only PRs Eva closed, skipping merged", () => {
    expect(unarchive).toContain("reopenArchivedPullRequests(");
    expect(reopen).toContain("row.stateOnArchive === undefined");
    expect(reopen).toContain('row.state === "merged"');
    expect(reopen).toContain('kind: "reopen"');
  });
});

function readSource(relativePath: string): string {
  return stripComments(readFileSync(join(convexDir, relativePath), "utf8"));
}

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
