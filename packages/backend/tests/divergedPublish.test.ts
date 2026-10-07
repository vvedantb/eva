import { describe, expect, test } from "vitest";
import {
  isEvaOwnedBranch,
  parseGitNameOnlyList,
  publishErrorNeedsForcePush,
  rewrittenBranchIsOwnHistory,
  rewrittenBranchPublishError,
} from "../convex/_sandbox_runtime/divergedPublish";

describe("parseGitNameOnlyList", () => {
  test("splits trimmed paths and drops empty lines", () => {
    expect(
      parseGitNameOnlyList("apps/web/a.tsx\n\npnpm-lock.yaml\n"),
    ).toEqual(["apps/web/a.tsx", "pnpm-lock.yaml"]);
  });
});

describe("publishErrorNeedsForcePush", () => {
  test("matches the rewritten-branch refusal, including the workflow's prefixed form", () => {
    const raw = rewrittenBranchPublishError("feature/x");
    expect(publishErrorNeedsForcePush(raw)).toBe(true);
    // sessionWorkflow prefixes the git error before storing it as errorDetail.
    expect(
      publishErrorNeedsForcePush(
        `Session completed locally, but Eva could not publish the branch to GitHub. The sandbox was preserved for recovery. ${raw}`,
      ),
    ).toBe(true);
  });

  test("does not match ambiguous diverged-publish failures where force-push could destroy work", () => {
    expect(
      publishErrorNeedsForcePush(
        "Could not merge origin/eva/session-abc (118 commits this sandbox never had) into the local branch (1 unpublished commits). The sandbox was left clean — there are no conflict markers to resolve. If you rewrote history, force-push; if both sides committed, merge the remote branch in the sandbox and retry.",
      ),
    ).toBe(false);
    expect(publishErrorNeedsForcePush("pushBranchToOrigin exhausted retries")).toBe(
      false,
    );
  });
});

describe("rewrittenBranchPublishError", () => {
  test("tells the reader why Eva did not force-push and what to do", () => {
    const unowned = rewrittenBranchPublishError("release/1.2");
    expect(unowned).toContain("release/1.2 is not one");
    expect(unowned).toContain("used to hold");
    expect(unowned).toContain("git push --force-with-lease origin release/1.2");
  });
});

describe("isEvaOwnedBranch", () => {
  test("only eva/ branches may ever be rewritten on GitHub", () => {
    expect(isEvaOwnedBranch("eva/task-abc")).toBe(true);
    expect(isEvaOwnedBranch("eva/session-abc")).toBe(true);
    expect(isEvaOwnedBranch("main")).toBe(false);
    expect(isEvaOwnedBranch("staging")).toBe(false);
    expect(isEvaOwnedBranch("feature/eva/x")).toBe(false);
  });
});

describe("rewrittenBranchIsOwnHistory", () => {
  const oldTip = "a".repeat(40);
  const rewrittenTip = "b".repeat(40);
  const foreignTip = "c".repeat(40);

  test("the remote tip the local branch once pointed at is the sandbox's own history", () => {
    // reflog show --format=%H lists the newest entry first.
    expect(
      rewrittenBranchIsOwnHistory(`${oldTip}\n`, [rewrittenTip, oldTip]),
    ).toBe(true);
  });

  test("a remote tip the branch never held was pushed by someone else, however much it changed", () => {
    // Quick task 220: 118 commits and 532 files landed on GitHub that the
    // sandbox never fetched. That is concurrent work to merge, not a rewrite.
    expect(
      rewrittenBranchIsOwnHistory(foreignTip, [rewrittenTip, oldTip]),
    ).toBe(false);
  });

  test("no reflog or no tip means merge, not force", () => {
    expect(rewrittenBranchIsOwnHistory(oldTip, [])).toBe(false);
    expect(rewrittenBranchIsOwnHistory("", [oldTip])).toBe(false);
  });
});
