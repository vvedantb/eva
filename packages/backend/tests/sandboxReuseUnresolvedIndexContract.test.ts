import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const sessions = readSource("_sandbox_runtime/sessions.ts");
const git = readSource("_sandbox_runtime/git.ts");

/**
 * Session n97ex5wm reused a VM whose previous run died mid-merge. Every
 * checkout then refused with "needs merge; error: you need to resolve your
 * current index first", reuse could not fall back (the old VM was alive), and
 * the session workflow died with an uncaught SandboxCommandFailedError. These
 * pins keep the in-place recovery that clears that state.
 */
describe("reused sandbox recovers from an unresolved merge index", () => {
  test("checkout retry aborts the stale merge instead of failing the session", () => {
    const body = functionBody(
      sessions,
      "async function checkoutSessionBranchWithRetry(",
    );
    expect(body).toContain("isUnresolvedGitIndexError(message)");
    expect(body).toContain("recoverUnresolvedGitIndex(sandbox)");
    // Recovery is one-shot so a second "needs merge" still fails loudly.
    expect(body).toContain("recoveredUnresolvedIndex");
  });

  test("the detector matches git's unresolved-index refusals", () => {
    const body = functionBody(
      git,
      "export function isUnresolvedGitIndexError(",
    );
    expect(body).toContain("needs merge");
    expect(body).toContain("resolve your current index first");
    expect(body).toContain("unmerged files");
    expect(body).toContain("merge_head exists");
  });

  test("recovery aborts every in-progress operation before resetting the index", () => {
    const body = functionBody(
      git,
      "export async function recoverUnresolvedGitIndex(",
    );
    expect(body).toContain("git merge --abort");
    expect(body).toContain("git rebase --abort");
    expect(body).toContain("git cherry-pick --abort");
    expect(body).toContain("git revert --abort");
    // Unmerged entries can outlive the operation marker; the reset is gated on
    // `git ls-files --unmerged` so a clean tree is never reset.
    expect(body).toContain("git ls-files --unmerged");
    expect(body).toContain("git reset --merge");
  });
});

function readSource(relativePath: string): string {
  return readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\n(?:export |async function |function |const )/);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}
