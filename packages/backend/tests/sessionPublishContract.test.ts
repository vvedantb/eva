import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

const sessionWorkflow = readSource("_sessions/workflow.ts");
const resultTarget = readSource("_sessions/resultTarget.ts");
const chatResult = readSource("_chat/chatResult.ts");
const sandboxExecution = readSource("_sandbox_runtime/execution.ts");
const sandboxGit = readSource("_sandbox_runtime/git.ts");
const sessionsSandbox = readSource("_sessions/sandbox.ts");
const taskChatWorkflow = readSource("agentTaskChatWorkflow.ts");
const projectChatWorkflow = readSource("projectChatWorkflow.ts");
const taskRunWorkflow = readSource("_taskWorkflow/workflowDefinition.ts");
const turnPersist = readSource("../callback-src/runtime/turnPersist.ts");
const claudeSdkDaemon = readSource(
  "../callback-src/providers/claudeSdkDaemon.ts",
);
const cursorSdkDaemon = readSource(
  "../callback-src/providers/cursorSdkDaemon.ts",
);
const codexAppServerDaemon = readSource(
  "../callback-src/providers/codexAppServerDaemon.ts",
);
const oneShotRunner = readSource("../callback-src/index.ts");

const PUSH_ACTION = "internal.sandbox.pushSandboxBranch";

/**
 * Eva owns publishing: the agent commits inside the sandbox and is told not to
 * push. Gating the push on a dirty tree therefore skipped it on every
 * *successful* run — a proper commit leaves the tree clean — so the work stayed
 * in the sandbox and never reached GitHub (fix c7df1ff2, again in 0fdcf11d).
 */
describe("a successful turn always publishes", () => {
  test("no workflow gates a push on a dirty tree", () => {
    const gated = convexFiles().filter((path) => {
      const source = readSource(path);
      return (
        source.includes(PUSH_ACTION) && source.includes("status --porcelain")
      );
    });
    expect(gated, "a clean tree is the normal success case").toEqual([]);
  });

  test("the session push is conditioned only on mode, success and branch", () => {
    const condition = pushCondition(sessionWorkflow);
    expect(condition).toContain("result.success");
    expect(condition).toContain("data.branchName");
    expect(condition).not.toContain("porcelain");
    expect(condition).not.toContain("isDirty");
  });
});

/**
 * The counterpart to the above: success and durability are orthogonal. A turn
 * that committed work (or left it dirty) and then failed still produced the
 * user's work, and losing it to a VM death is the same data loss — a hard death
 * snapshots nothing and the next resume rolls the filesystem back.
 *
 * The daemon is the only place that can fix this. It alone knows the worktree
 * state at the moment it dies, and the workflow push stays success-gated: a
 * server push after a failure races the daemon prewarm respawns for the next
 * turn, and it does not auto-commit, so it publishes nothing extra once the
 * daemon has already persisted.
 */
describe("a failed turn still publishes its work", () => {
  test.each([
    ["failTurnAndExit", "postClaimedTurnFailureCompletion"],
    ["failSyntheticTurn", "COMPLETE_SYNTHETIC_TURN_MUTATION"],
  ] as const)("claude %s persists before its completion", (fn, mutation) => {
    const body = functionBody(claudeSdkDaemon, `async function ${fn}(`);
    assertPersistsFirst(body, mutation, fn);
  });

  /** The SDK stream dying under a turn is reported by the daemon's pump. */
  test("the claude pump failure persists before its completion", () => {
    assertPersistsFirst(
      blockAt(claudeSdkDaemon, 'log("daemon: query failed'),
      "Agent SDK daemon failed: ",
      "the claude message pump",
    );
  });

  /** Cursor runs each turn in a disposable worker: three failure reporters. */
  test.each([
    ["failTurnAndExit", "postClaimedTurnFailureCompletion"],
    ["executeClaimedTurn", "deliverCompletionWithMedia(completionArgs)"],
    ["reportCursorTurnWorkerFailure", "postClaimedTurnFailureCompletion"],
  ] as const)("cursor %s persists before its completion", (fn, mutation) => {
    const body = functionBody(cursorSdkDaemon, `async function ${fn}(`);
    assertPersistsFirst(body, mutation, fn);
  });

  /**
   * Codex reports success and failure through one finalizeTurn, and the
   * one-shot runner's fatal-error handler is the only completion its process
   * posts when the provider throws on the way out.
   */
  test("codex finalizes both outcomes through the persisting path", () => {
    const body = functionBody(
      codexAppServerDaemon,
      "async function failActiveTurn(",
    );
    expect(body, "codex failure stopped reusing finalizeTurn").toContain(
      "finalizeTurn(false, error)",
    );
    assertPersistsFirst(
      functionBody(codexAppServerDaemon, "async function finalizeTurn("),
      "deliverCompletionWithMedia(completionArgs)",
      "codex finalizeTurn",
    );
  });

  test("the one-shot fatal-error completion persists first", () => {
    assertPersistsFirst(
      blockAt(oneShotRunner, "} catch (err) {"),
      'callConvexWithRetry("mutation", COMPLETION_MUTATION',
      "the one-shot fatal-error handler",
    );
  });
});

/**
 * The push action used to swallow its own errors, which made every caller's
 * catch block dead code and reported failed pushes as successes (fix c7df1ff2).
 */
describe("push failures reach their callers", () => {
  test("pushSandboxBranch rethrows", () => {
    const body = definitionBody(sandboxExecution, "pushSandboxBranch");
    const catchAt = body.indexOf("} catch (error) {");
    expect(catchAt, "the push error handler moved").toBeGreaterThan(-1);
    expect(body.indexOf("throw error;", catchAt)).toBeGreaterThan(catchAt);
  });

  /** A rethrow with an unguarded call site kills the whole workflow step. */
  test("every call site handles the throw", () => {
    const sites: string[] = [];
    const unguarded: string[] = [];
    for (const path of convexFiles()) {
      const source = readSource(path);
      let at = source.indexOf(PUSH_ACTION);
      while (at > -1) {
        sites.push(`${path}:${at}`);
        const tryAt = source.lastIndexOf("try {", at);
        const catchAt = source.indexOf("} catch", at);
        if (tryAt < 0 || catchAt < 0) unguarded.push(`${path}:${at}`);
        at = source.indexOf(PUSH_ACTION, at + 1);
      }
    }
    // A scan that found nothing would satisfy the assertion below for free.
    expect(
      sites.length,
      "the push action moved or was renamed",
    ).toBeGreaterThan(5);
    expect(
      unguarded,
      "wrap the push so a failure surfaces as an alert",
    ).toEqual([]);
  });
});

/**
 * A push can hang for minutes. Saving the reply first is what stops the chat
 * sitting on "Working…" after the daemon has already finished (fix 27bef8e0).
 */
describe("the reply is saved before the push", () => {
  test.each([
    [
      "session",
      sessionWorkflow,
      "internal.sessionWorkflow.saveResult",
      "sessionCompleteEvent",
    ],
    [
      "task chat",
      taskChatWorkflow,
      "internal.agentTaskChatWorkflow.saveResult",
      "agentTaskChatCompleteEvent",
    ],
    [
      "project chat",
      projectChatWorkflow,
      "internal.projectChatWorkflow.saveResult",
      "projectChatCompleteEvent",
    ],
  ] as const)("%s saves the completion result before the push", (
    _label,
    source,
    saveFn,
    completeEvent,
  ) => {
    const completeAt = source.indexOf(`awaitEvent(${completeEvent})`);
    expect(completeAt, `${completeEvent} await moved`).toBeGreaterThan(-1);
    const saveAt = source.indexOf(saveFn, completeAt);
    const pushAt = source.indexOf(PUSH_ACTION, completeAt);
    expect(saveAt, `${saveFn} after completion moved`).toBeGreaterThan(-1);
    expect(pushAt, "push after completion moved").toBeGreaterThan(-1);
    expect(saveAt).toBeLessThan(pushAt);
  });

  /**
   * The failure is then reported as its own alert, which only works because
   * saveResult recognises the prefix the workflow produces. A typo in either
   * literal makes the second saveResult run the generic finaliser again and
   * replace the saved answer with "Error: …".
   */
  test("saveResult recognises the publish-failure message it is sent", () => {
    const marker = resultTarget.match(
      /PUBLISH_FAILURE_MARKER =\s*"([^"]+)"/,
    );
    expect(marker, "the publish-failure marker moved").not.toBeNull();
    const prefix = marker?.[1] ?? "";
    expect(prefix.length).toBeGreaterThan(0);
    expect(resultTarget).toContain("formatDelayedPublishFailureError");
    expect(resultTarget).toContain(prefix);
    for (const source of [
      sessionWorkflow,
      taskChatWorkflow,
      projectChatWorkflow,
      taskRunWorkflow,
    ]) {
      expect(
        source,
        "the workflow must format the failure through the shared helper",
      ).toContain("formatDelayedPublishFailureError(");
    }
  });
});

/**
 * Because the reply is saved before the push, a push failure arrives late —
 * often after the next regular or queued turn has started. Re-running the
 * generic finaliser then patched the NEWER turn's placeholder with the
 * previous answer, cleared its live streaming row and wiped its
 * activeWorkflowId (fix 60a9b977).
 */
describe("a delayed publish failure cannot rewrite a newer turn", () => {
  test.each([
    ["session", sessionWorkflow],
    ["task chat", taskChatWorkflow],
    ["project chat", projectChatWorkflow],
  ] as const)(
    "%s saveResult isolates the failure before touching turn state",
    (_label, source) => {
      const body = definitionBody(source, "saveResult");
      expect(body).toContain("applyChatTurnResult(");
      expect(body).toContain('"publish-failure"');
    },
  );

  test.each([
    ["session", sessionWorkflow],
    ["task chat", taskChatWorkflow],
    ["project chat", projectChatWorkflow],
  ] as const)("%s failure becomes a standalone system alert", (_label, source) => {
    const body = definitionBody(source, "saveResult");
    expect(body).toContain("applyChatTurnResult(");
    expect(body).toContain("return null;");
  });

  test("the shared module isolates the failure before touching turn state", () => {
    const apply = functionBody(
      chatResult,
      "export async function applyChatTurnResult(",
    );
    const guardAt = apply.indexOf("recordDelayedPublishFailure(");
    const salvageAt = apply.indexOf("salvageAndClearStreamingActivity(");
    const writeAt = apply.indexOf("writeAssistantTurnResult(");
    expect(guardAt, "the publish-failure guard moved").toBeGreaterThan(-1);
    expect(salvageAt, "the streaming salvage moved").toBeGreaterThan(-1);
    expect(writeAt, "the result write moved").toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(salvageAt);
    expect(guardAt).toBeLessThan(writeAt);

    const record = functionBody(
      chatResult,
      "export async function recordDelayedPublishFailure(",
    );
    expect(record).toContain("isSystemAlert: true");
  });
});

/**
 * The counterpart to "a successful turn always publishes": a turn that made no
 * commits (chat/Q&A) must publish NOTHING. Its first push would create the
 * remote branch — a ref update that runs the target repo's pre-push hooks in a
 * fresh sandbox where generated artefacts (Next.js route types, say) don't
 * exist — so chat-only sessions spammed publish-failure alerts. The gate asks
 * whether HEAD carries commits origin lacks; a dirty-tree check stays banned
 * (see the porcelain rule above).
 */
describe("an empty turn publishes nothing", () => {
  test("the push gates on commits origin lacks, not a dirty tree", () => {
    const body = functionBody(
      sandboxGit,
      "export async function pushBranchToOrigin(",
    );
    const gateAt = body.indexOf(
      "git rev-list --count HEAD --not ${exclusion}",
    );
    const pushAt = body.indexOf("git push");
    expect(gateAt, "the ahead-of-remote gate moved").toBeGreaterThan(-1);
    expect(pushAt, "the push moved").toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(pushAt);
    expect(body).toContain('const exclusion = remoteExists');
    expect(body).toContain(': "--remotes=origin";');
    expect(body).not.toContain("porcelain");
  });
});

/**
 * A preserved or resumed sandbox can have local-only commits while another
 * callback/sandbox has advanced the same stable session branch. A blind push
 * is then rejected with "fetch first". Publication must refresh that exact
 * ref, preserve local work, and retry after incorporating the remote tip.
 */
describe("session branch publication reconciles concurrent remote work", () => {
  test("the backend fetches and reconciles before its ahead gate and push", () => {
    const sync = functionBody(
      sandboxGit,
      "async function synchronizeBranchForPublish(",
    );
    const fetchAt = sync.indexOf("fetchBranchRefs(");
    const divergenceAt = sync.indexOf("git rev-list --left-right --count");
    expect(fetchAt).toBeGreaterThan(-1);
    expect(divergenceAt).toBeGreaterThan(fetchAt);
    expect(sync).toContain("git merge --ff-only");
    // Merge, never rebase: rebasing a branch that merged its base in replays
    // every base commit onto the remote tip and conflicts on work neither
    // side changed (evalucom/carepulse-ts project 3, 19 Aug 2026).
    expect(sync).toContain("git merge --no-edit ${quotedRemoteRef}");
    expect(sync).toContain("git merge --abort");
    expect(sync).not.toContain("git rebase");
    expect(sync).toContain("git update-ref -d");
    // A rewritten local branch (rebase onto a new base) must not merge the
    // old remote tip back in (task 231). The reflog decides that before the
    // merge; file counts never do (quick task 220).
    const rewriteAt = sync.indexOf("rewrittenBranchIsOwnHistory(");
    const mergeAt = sync.indexOf("git merge --no-edit ${quotedRemoteRef}");
    expect(rewriteAt, "the own-history check moved").toBeGreaterThan(-1);
    expect(mergeAt, "the both-moved merge moved").toBeGreaterThan(-1);
    expect(rewriteAt).toBeLessThan(mergeAt);
    expect(sync).not.toContain("git diff --name-only");
    // The refusal text lives in divergedPublish.ts next to
    // publishErrorNeedsForcePush, so the web recovery banner cannot drift.
    expect(sync).toContain("rewrittenBranchPublishError(");
    expect(sync).toContain("no conflict markers to resolve");

    const push = functionBody(
      sandboxGit,
      "export async function pushBranchToOrigin(",
    );
    const syncAt = push.indexOf("synchronizeBranchForPublish(");
    const gateAt = push.indexOf("git rev-list --count HEAD --not");
    const pushAt = push.indexOf("git push");
    expect(syncAt).toBeGreaterThan(-1);
    expect(syncAt).toBeLessThan(gateAt);
    expect(gateAt).toBeLessThan(pushAt);
    expect(push).toContain("isNonFastForwardPushError(message)");
  });

  test("resuming prefers a preserved local branch over a stale remote ref", () => {
    const resolveAt = sandboxGit.indexOf(
      "async function resolveBranchStartTarget(",
    );
    const localAt = sandboxGit.indexOf(
      'return { ref: branchName, source: "localBranch" };',
      resolveAt,
    );
    const remoteAt = sandboxGit.indexOf(
      'return { ref: `origin/${branchName}`, source: "remoteBranch" };',
      resolveAt,
    );
    expect(resolveAt).toBeGreaterThan(-1);
    expect(localAt).toBeGreaterThan(-1);
    expect(remoteAt).toBeGreaterThan(localAt);
  });

  test("the pre-completion durability push follows the same protocol", () => {
    const syncAt = turnPersist.indexOf("synchronizeForPush(branch.out)");
    const gateAt = turnPersist.indexOf("tipAlreadyPublished(exclusion)");
    const pushAt = turnPersist.indexOf('git(["push", "origin", refspec]');
    expect(turnPersist).toContain('"fetch",\n      "--no-tags"');
    expect(turnPersist).toContain('git(["merge", "--no-edit", remoteRef]');
    expect(turnPersist).toContain('git(["merge", "--abort"]');
    expect(turnPersist).not.toContain('"rebase"');
    const rewriteAt = turnPersist.indexOf("localBranchRewroteOwnHistory(branch, remoteRef)");
    const mergeAt = turnPersist.indexOf('git(["merge", "--no-edit", remoteRef]');
    expect(rewriteAt, "the own-history check moved").toBeGreaterThan(-1);
    expect(mergeAt, "the both-moved merge moved").toBeGreaterThan(-1);
    expect(rewriteAt).toBeLessThan(mergeAt);
    expect(turnPersist).toContain('"reflog", "show", "--format=%H"');
    expect(turnPersist).not.toContain('"diff", "--name-only"');
    expect(syncAt).toBeGreaterThan(-1);
    expect(syncAt).toBeLessThan(gateAt);
    expect(gateAt).toBeLessThan(pushAt);
    expect(turnPersist).toContain("isNonFastForwardPush(push.out)");
  });
});

/**
 * The gate above is only half of it. `pushBranchToOrigin` returned `void`, so a
 * skipped push was indistinguishable from a real one and every workflow ran its
 * PR step against a branch origin never received — GitHub's compare 404s
 * through all retries and posts a spurious "Failed to create PR" alert (fix
 * 06963e8e, prod session 37, twice). The skip has to reach the callers, and
 * every PR step has to be gated on it.
 */
describe("a turn that pushed nothing opens no pull request", () => {
  /** Matches createPullRequest, createTaskPullRequest, refreshTaskPullRequestBody, createDraftSessionPr. */
  const PR_STEP = /internal\.[A-Za-z_.]*(?:PullRequest|SessionPr)[A-Za-z]*/;

  const pushBody = () =>
    functionBody(sandboxGit, "export async function pushBranchToOrigin(");

  test("pushBranchToOrigin reports which of the two paths it took", () => {
    const body = pushBody();
    const skipAt = body.indexOf(
      "return { pushed: false, published: remoteExists };",
    );
    const pushAt = body.indexOf("git push");
    const pushedAt = body.indexOf(
      "return { pushed: true, published: true };",
    );
    expect(skipAt, "the skip no longer reports itself").toBeGreaterThan(-1);
    expect(pushedAt, "the push no longer reports itself").toBeGreaterThan(-1);
    expect(skipAt, "the skip belongs before the push").toBeLessThan(pushAt);
    expect(pushAt).toBeLessThan(pushedAt);
  });

  /**
   * Both returns sit inside the logged step's callback, so awaiting that step
   * without returning its value hands every caller `undefined` — which reads as
   * "did not push" to an `if (result.pushed)` and as a crash to `result.pushed`.
   */
  test("the logged step's value is returned, not just awaited", () => {
    expect(
      pushBody(),
      "an awaited-but-unreturned step drops the outcome",
    ).toContain("return await runLoggedGitStep(");
  });

  /**
   * Convex strips anything the `returns` validator does not describe, so a
   * stale `v.null()` here would hand every caller `null` back — the original
   * bug, reintroduced with the function above still correct.
   */
  test("pushSandboxBranch declares the object it returns", () => {
    const returns = definitionBody(sandboxExecution, "pushSandboxBranch").match(
      /returns:\s*([^\n]+)/,
    );
    expect(returns, "the returns validator moved").not.toBeNull();
    expect(returns?.[1] ?? "").toContain(
      "v.object({ pushed: v.boolean(), published: v.boolean() })",
    );
  });

  /**
   * The fan-out that actually regresses: a sixth workflow, or a refactor that
   * stops threading the result through, silently brings the 404 alerts back.
   * Push-only callers have no PR step and are left alone.
   */
  test("every workflow that pushes and opens a PR gates on the result", () => {
    const gated: string[] = [];
    const ungated: string[] = [];
    for (const path of convexFiles()) {
      const source = readSource(path);
      const prAt = source.search(PR_STEP);
      if (!source.includes(PUSH_ACTION) || prAt < 0) continue;
      const pushedAt = source.indexOf(".pushed");
      if (pushedAt > -1 && pushedAt < prAt) gated.push(path);
      else ungated.push(path);
    }
    // A scan that found nothing would satisfy the assertion below for free.
    expect(gated.length + ungated.length, "the push action moved").toBe(5);
    expect(
      ungated,
      "open the PR only when the push reported pushed: true",
    ).toEqual([]);
  });
});

/**
 * Session callbacks push work before completion so a VM death cannot erase a
 * finished turn. The later workflow push must recognise that exact remote head
 * or it suppresses the automatic draft PR (prod session 38).
 */
describe("a callback-published session still opens its first pull request", () => {
  test("the Claude callback persists work before reporting completion", () => {
    assertPersistsFirst(
      functionBody(claudeSdkDaemon, "async function finalizeTurn("),
      "await deliverCompletionWithMedia(completionArgs);",
      "finalizeTurn",
    );
    expect(turnPersist).toContain('git(["push", "origin", refspec]');
  });

  /**
   * Synthetic turns (background-agent continuations) have no workflow, so the
   * server-side pushSandboxBranch step never runs for them and the daemon's own
   * push is the ONLY one. Without it, work committed during a synthetic turn sat
   * in the sandbox until the next real turn happened to push it (prod, 27 Aug).
   */
  test("the synthetic-turn path persists before its completion", () => {
    assertPersistsFirst(
      functionBody(claudeSdkDaemon, "async function finalizeSyntheticTurn("),
      "COMPLETE_SYNTHETIC_TURN_MUTATION",
      "finalizeSyntheticTurn",
    );
  });

  /**
   * Synthetic turns finalize on every background-agent continuation, so the
   * no-op case must be answered from local refs — a fetch per continuation is
   * pure cost.
   */
  test("the durability push short-circuits before touching the network", () => {
    const body = functionBody(turnPersist, "export function persistTurnWork(");
    const guardAt = body.indexOf("tipAlreadyPublished([");
    const fetchAt = body.indexOf("synchronizeForPush(");
    expect(guardAt, "the local no-op guard is missing").toBeGreaterThan(-1);
    expect(fetchAt, "the fetch/push step moved").toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(fetchAt);
  });

  /**
   * `HEAD` and a bare branch name both resolve through repo state (the branch a
   * detached HEAD sits on, the configured upstream), so a session whose upstream
   * was left as `origin/<base>` could aim its publish at the base branch. Both
   * push paths name the exact ref instead.
   */
  test("both push paths push a fully-qualified refspec", () => {
    expect(turnPersist).toContain(
      "const refspec = `refs/heads/${branch.out}:refs/heads/${branch.out}`",
    );
    const body = functionBody(
      sandboxGit,
      "export async function pushBranchToOrigin(",
    );
    expect(body).toContain(
      "`refs/heads/${branchName}:refs/heads/${branchName}`",
    );
    expect(body, "HEAD resolves through repo state").not.toMatch(
      /git push[^`\n]*\bHEAD\b/,
    );
  });

  /**
   * `git checkout -B <branch> origin/<base>` tracks the START POINT, which left
   * the working branch's upstream as `origin/<base>` — the shape that made a
   * bare `git push` fatal (or aim at the base branch) and `git pull` rebase onto
   * it. Both branch-setup paths must create with `--no-track` and pin the
   * upstream to the branch's own name.
   */
  test("branch setup pins the upstream to the working branch", () => {
    for (const entry of [
      "export async function checkoutSessionBranch(",
      "export async function setupBranch(",
    ]) {
      const body = functionBody(sandboxGit, entry);
      expect(body, `${entry} lost --no-track`).toContain("--no-track");
      expect(body, `${entry} lost the upstream pin`).toContain(
        "pinBranchUpstream(sandbox, branchName)",
      );
    }
    const pin = functionBody(sandboxGit, "async function pinBranchUpstream(");
    expect(pin).toContain("branch.${branchName}.remote");
    expect(pin).toContain("refs/heads/${branchName}");
  });

  /**
   * The dev server regenerates files (routeTree.gen.ts) between the snapshot
   * reset and the session-branch checkout; when the base ref moved past the
   * snapshot and touches those files, a plain `checkout -b` aborts, the run
   * proceeds on the base branch, and publish strands the work (prod sessions
   * eva/65 and eva/66). Creation only runs on fresh sandboxes with no user
   * work, so both arms must force.
   */
  test("session branch creation forces past re-dirtied snapshot files", () => {
    const body = functionBody(
      sandboxGit,
      "export async function checkoutSessionBranch(",
    );
    expect(body, "remote arm lost -f").toContain(
      "git checkout -f -b ${quotedBranch} ${quotedRemoteBranch}",
    );
    expect(body, "base fallback arm lost -f").toContain(
      "git checkout -f --no-track -b ${quotedBranch} ${quotedBase}",
    );
  });

  /**
   * When the startup checkout failed anyway (older sandbox, new failure mode),
   * publish must recover the unambiguous shape instead of stranding the work:
   * no local session branch means every local commit is the session's, so the
   * branch is created at HEAD (touches no files) and publication proceeds.
   * Anything else — detached HEAD, or a session branch that exists but is not
   * checked out — still refuses.
   */
  test("publish heals a session stranded on its base branch", () => {
    const body = functionBody(
      sandboxGit,
      "async function synchronizeBranchForPublish(",
    );
    const healGate = "git show-ref --verify --quiet ${quotedLocalHeadRef}";
    expect(body, "heal gate lost its local-branch probe").toContain(healGate);
    expect(body, "heal lost its no-touch branch creation").toContain(
      "git switch -c ${quote([branchName])}",
    );
    expect(body, "healed branch lost its upstream pin").toContain(
      "pinBranchUpstream(sandbox, branchName)",
    );
    expect(body, "detached HEAD must still refuse").toContain(
      'currentBranch === ""',
    );
    expect(body, "ambiguous shapes must still refuse").toContain(
      "Refusing to publish",
    );
  });

  /**
   * The generic "some services may still be starting" banner misdescribed a
   * failed branch checkout as a services problem (prod sessions eva/65 and
   * eva/66). The step label runLoggedSessionStep prefixes onto the error is
   * the routing key; all three checkout step labels must keep matching it.
   */
  test("the startup warning names a failed branch checkout", () => {
    const body = definitionBody(sessionsSandbox, "sandboxStartupWarning");
    const routing = "/\\.(checkoutSessionBranch|checkoutBranch):/";
    expect(body, "checkout routing regex changed").toContain(routing);
    expect(body, "checkout-specific copy lost").toContain(
      "Session branch could not be created",
    );
    expect(body, "generic copy lost").toContain("Sandbox startup unfinished");
    const stepLabels = [
      "newSessionSandbox.checkoutSessionBranch:",
      "newTaskSandbox.checkoutBranch:",
      "newProjectSandbox.checkoutBranch:",
    ];
    const runtimeSessions = readSource("_sandbox_runtime/sessions.ts");
    for (const label of stepLabels) {
      expect(runtimeSessions, `step label ${label} renamed`).toContain(
        label.slice(0, -1),
      );
      expect(
        /\.(checkoutSessionBranch|checkoutBranch):/.test(label),
        `routing regex no longer matches ${label}`,
      ).toBe(true);
    }
  });

  test("the post-completion push reports an already-published branch", () => {
    const body = functionBody(
      sandboxGit,
      "export async function pushBranchToOrigin(",
    );
    expect(body).toContain("refs/remotes/origin/${branchName}");
    expect(body).toContain(
      "return { pushed: false, published: remoteExists };",
    );
    expect(body).toContain("return { pushed: true, published: true };");
  });

  test("a published branch recovers only a missing session PR", () => {
    expect(sessionWorkflow).toContain(
      "pushedCommits || (branchPublished && data.prUrl === undefined)",
    );
  });
});

/** Comments name the very calls these rules rule out, so they have to go first. */
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

/**
 * One catch/handler block, from `marker` to the `}` that closes it at that
 * indentation. Bounded on purpose: an open-ended slice lets a persist call
 * further down the file satisfy an assertion about this block.
 */
function blockAt(source: string, marker: string): string {
  const startAt = source.indexOf(marker);
  expect(startAt, `${marker} moved`).toBeGreaterThan(-1);
  const indent = " ".repeat(startAt - source.lastIndexOf("\n", startAt) - 1);
  const end = source.indexOf(`\n${indent}}`, startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** Durability before completion: the ordering every finalize path shares. */
function assertPersistsFirst(
  body: string,
  completionMarker: string,
  label: string,
): void {
  const persistAt = [
    body.indexOf("persistTurnWork();"),
    body.indexOf("reconcileStreamingAndPersist()"),
  ]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const completionAt = body.indexOf(completionMarker);
  expect(persistAt, `${label} lost its durability push`).toBeGreaterThan(-1);
  expect(completionAt, `the ${label} completion moved`).toBeGreaterThan(-1);
  expect(persistAt).toBeLessThan(completionAt);
}

/** The `if (…)` a workflow wraps its push step in. */
function pushCondition(source: string): string {
  const pushAt = source.indexOf(PUSH_ACTION);
  expect(pushAt, "the push action moved").toBeGreaterThan(-1);
  return source.slice(source.lastIndexOf("if (", pushAt), pushAt);
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
