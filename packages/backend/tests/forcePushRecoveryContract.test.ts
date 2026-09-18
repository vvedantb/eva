import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

const sandboxGit = readSource("_sandbox_runtime/git.ts");
const sandboxSessions = readSource("_sandbox_runtime/sessions.ts");
const sessionsSandbox = readSource("_sessions/sandbox.ts");

const HELPER = "forcePushBranchToOrigin";

/**
 * The rewritten-branch publish refusal now offers a one-click recovery, and
 * that recovery is the only place in the product that rewrites history on
 * GitHub: it replaces origin/<branch> with the sandbox's branch. Every
 * safeguard below is invisible to the type checker and destroys a user's
 * remote commits when it regresses, so each is pinned here.
 */
describe("the force-push recovery cannot silently discard remote commits", () => {
  const body = functionBody(sandboxGit, `export async function ${HELPER}(`);

  test("the push is leased, never a bare force", () => {
    expect(body).toContain("--force-with-lease=");
    // `--force`/`-f` would overwrite whatever landed on the branch between the
    // publish failure and the user pressing the button.
    expect(body).not.toMatch(/--force(?![-\w])/);
    expect(body).not.toMatch(/git push[^\n]*\s-f\b/);
  });

  test("the lease is pinned to a ref this call just refreshed", () => {
    const fetchAt = body.indexOf("fetchBranchRefs(");
    const leaseAt = body.indexOf("--force-with-lease=");
    const pushAt = body.indexOf("git push");
    expect(fetchAt, "the pre-push fetch moved").toBeGreaterThan(-1);
    expect(pushAt, "the push moved").toBeGreaterThan(-1);
    // Stale lease = no lease: a push that landed before this fetch must abort
    // the push rather than be discarded by it.
    expect(fetchAt).toBeLessThan(leaseAt);
    expect(leaseAt).toBeLessThan(pushAt);
    // The only excuse for dropping the lease is the fetch reporting the remote
    // branch gone — there is then nothing to protect.
    expect(body).toContain("fetched.includes(branchName)");
  });

  test("a branch missing from the sandbox aborts before the push", () => {
    const checkAt = body.indexOf("git show-ref --verify");
    const refuseAt = body.indexOf("does not exist in the sandbox");
    expect(checkAt, "the local branch check moved").toBeGreaterThan(-1);
    expect(refuseAt).toBeGreaterThan(checkAt);
    expect(refuseAt).toBeLessThan(body.indexOf("git push"));
  });

  test("the branch name is validated and quoted before it reaches a shell", () => {
    const validateAt = body.indexOf("isSafeBranchName(branchName)");
    expect(validateAt, "the branch name guard moved").toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(body.indexOf("execGitCommand("));
    // Fully qualified on both sides so the refspec cannot resolve to a tag or
    // some other ref that happens to share the name.
    expect(body).toContain("refs/heads/${branchName}:refs/heads/${branchName}");
  });

  test("only the user-confirmed session recovery calls it", () => {
    const callers = convexFiles().filter(
      (path) => path !== "_sandbox_runtime/git.ts" && callsHelper(path),
    );
    // The automatic publish path has its own, narrower leased push (pinned
    // below); it must not reach for the tracking-ref lease this helper uses.
    expect(
      callers,
      "the user-confirmed force-push must not become part of an automatic publish path",
    ).toEqual(["_sandbox_runtime/sessions.ts"]);
    expect(definitionBody(sandboxSessions, "performForcePushBranch")).toContain(
      `${HELPER}(`,
    );
  });
});

/**
 * The automatic publish may replace origin/<branch> too, but only for an eva/
 * branch whose remote tip the local branch itself once pointed at — the
 * sandbox rewrote history it already held. Each guard below is what keeps that
 * from ever discarding a commit the sandbox never held. The decision rests on
 * the reflog alone: a file-count classifier misread quick task 220 (2–3 Sep
 * 2026, 118 foreign commits on GitHub vs one local) as a rewrite and refused
 * a publish that a merge completes.
 */
describe("the automatic publish only replaces the sandbox's own old history", () => {
  const sync = functionBody(
    sandboxGit,
    "async function synchronizeBranchForPublish(",
  );
  const push = functionBody(
    sandboxGit,
    "export async function pushBranchToOrigin(",
  );

  test("the replace is offered only when the remote tip is in the local reflog, and only for eva/ branches", () => {
    const reflogAt = sync.indexOf("localBranchReflogShas(sandbox, branchName)");
    const ownHistoryAt = sync.indexOf("rewrittenBranchIsOwnHistory(");
    const ownedAt = sync.indexOf("isEvaOwnedBranch(branchName)");
    const replaceAt = sync.indexOf("replaceRemoteTip: remoteTip");
    const mergeAt = sync.indexOf("git merge --no-edit ${quotedRemoteRef}");
    expect(reflogAt, "the reflog read is gone").toBeGreaterThan(-1);
    expect(ownHistoryAt, "the own-history check is gone").toBeGreaterThan(reflogAt);
    expect(ownedAt, "the eva/ ownership guard is gone").toBeGreaterThan(ownHistoryAt);
    expect(replaceAt, "the replace is no longer offered").toBeGreaterThan(ownedAt);
    // The refusal keeps the banner-matched wording; it is the only refusal left.
    expect(sync).toContain("rewrittenBranchPublishError(branchName)");
    expect(sync).not.toContain("remote-holds-foreign-commits");
    // A foreign remote tip is merged, never refused and never forced: the merge
    // must follow the own-history branch, and no file-count classifier may sit
    // in front of either.
    expect(replaceAt).toBeLessThan(mergeAt);
    expect(sync).not.toContain("divergedPublishLooksLikeRewrite");
    expect(sync).not.toContain("git diff --name-only");
  });

  test("a missing reflog merges instead of guessing", () => {
    const reflog = functionBody(
      sandboxGit,
      "async function localBranchReflogShas(",
    );
    expect(reflog).toContain("git reflog show --format=%H");
    expect(reflog).toContain("return [];");
  });

  test("the push is leased on the exact verified sha, never a bare force", () => {
    expect(push).toContain(
      "--force-with-lease=${quote([`refs/heads/${branchName}:${replaceRemoteTip}`])}",
    );
    expect(push).not.toMatch(/--force(?![-\w])/);
    expect(push).not.toMatch(/git push[^\n]*\s-f\b/);
    // No lease unless the sync vouched for the replace.
    const leaseAt = push.indexOf("replaceRemoteTip === undefined");
    const pushAt = push.indexOf("git push ${lease}");
    expect(leaseAt, "the lease is no longer conditional").toBeGreaterThan(-1);
    expect(pushAt, "the push no longer carries the lease").toBeGreaterThan(leaseAt);
    // A lease rejection re-syncs rather than failing the turn: the classifier
    // tags "stale info" as non-fast-forward, and the push pipeline retries
    // that tag by re-running the sync (which recomputes the lease).
    expect(push).toContain('failure._tag === "GitNonFastForwardError"');
    expect(push).toContain("while: isRetryablePushFailure");
    expect(
      functionBody(
        readSource("_git/gitErrors.ts"),
        "function isNonFastForwardPushMessage(",
      ),
    ).toContain('"stale info"');
  });
});

/**
 * The mutation is the authorization boundary — the action behind it takes the
 * branch name on trust.
 */
describe("the recovery mutation guards which branch may be rewritten", () => {
  const mutation = definitionBody(sessionsSandbox, "forcePushBranch");

  test("it resolves session access before anything else", () => {
    expect(mutation).toContain("getSessionWithAccess(");
  });

  test("only an eva-owned branch on a running sandbox reaches the action", () => {
    const scheduleAt = mutation.indexOf(
      "internal.sandbox.performForcePushBranch",
    );
    expect(scheduleAt, "the scheduled recovery action moved").toBeGreaterThan(
      -1,
    );
    // A base branch must never be reachable through this path.
    const branchGuardAt = mutation.indexOf("isEvaOwnedBranch(");
    expect(branchGuardAt, "the eva/ branch guard is gone").toBeGreaterThan(-1);
    expect(branchGuardAt).toBeLessThan(scheduleAt);
    const sandboxGuardAt = mutation.indexOf('session.status !== "active"');
    expect(sandboxGuardAt, "the sandbox guard is gone").toBeGreaterThan(-1);
    expect(sandboxGuardAt).toBeLessThan(scheduleAt);
    expect(mutation).toContain("!session.sandboxId");
  });
});

/**
 * The banner that starts the recovery shows "requested" until a newer chat
 * message replaces it, and the action has no other channel back. Swallowing
 * either outcome leaves the session wedged on that line forever.
 */
describe("the recovery reports its outcome into the chat either way", () => {
  const action = definitionBody(sandboxSessions, "performForcePushBranch");

  test("success and failure both post a system alert", () => {
    const alerts = action.match(
      /internal\.sessionWorkflow\.postSystemAlert/g,
    )?.length;
    expect(alerts, "an outcome path stopped reporting").toBe(2);
    const catchAt = action.indexOf("} catch (error) {");
    expect(catchAt, "the failure path moved").toBeGreaterThan(-1);
    expect(action.slice(catchAt)).toContain("postSystemAlert");
    expect(action.slice(catchAt)).toContain("errorDetail");
  });
});

function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

function convexFiles(): string[] {
  return readdirSync(convexDir, { recursive: true })
    .map((entry) => String(entry).replaceAll("\\", "/"))
    .filter((path) => path.endsWith(".ts"))
    .filter((path) => !path.includes("_generated"));
}

/** A call to the helper, not its import or a mention in prose. */
function callsHelper(path: string): boolean {
  return new RegExp(`${HELPER}\\(`).test(readSource(path));
}

/** One top-level function, ending on the `\n}` that closes it at column 0. */
function functionBody(source: string, header: string): string {
  const startAt = source.indexOf(header);
  expect(startAt, `${header} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** One Convex definition, ending on the `\n});` that closes it. */
function definitionBody(source: string, name: string): string {
  const startAt = source.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n});", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
