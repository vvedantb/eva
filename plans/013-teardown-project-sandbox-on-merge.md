# Plan 013: A merged project branch fully retires its sandbox and chat turn

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (if that file exists) — unless a reviewer dispatched
> you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/githubWebhook.ts packages/backend/convex/_projects/sandbox.ts packages/backend/convex/projectChatWorkflow.ts packages/backend/tests/prClosedProjectScope.test.ts internal/changelog/2026-11.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (`internal/changelog/2026-11.md`
> changes often; a change there alone is not a STOP.)

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

When the pull request of a project's current branch merges, the GitHub webhook
deletes the project sandbox and clears `sandboxId`, but it leaves everything
else as it was. `reviewProjectSandboxStatus` can stay `"active"` or
`"starting"`, so the UI shows a live preview with no VM behind it. A running
chat turn keeps `activeChatWorkflowId` set, so the chat stays "Working…" until
the 2-hour watchdog, and new messages queue behind a dead turn. A blocking
AskUserQuestion row stays in `pendingQuestions`, which hides the composer.
After this plan, a merge on the current branch cancels any chat turn, deletes
the sandbox, closes the sandbox status and detaches pending questions — the
same clean-up every other stop path already does.

## Current state

Files:

- `packages/backend/convex/githubWebhook.ts` — `pull_request` webhook. The
  project branch (`applyProjectPrEvent`, lines 195–271) has the bug at lines
  217–235. The quick-task branch (`applyQuickTaskPrClosed`, lines 278–347)
  is the model to follow (lines 329–345).
- `packages/backend/convex/_projects/sandbox.ts` — project sandbox lifecycle.
  `requestProjectSandboxStop` (lines 406–463) is the shared stop path and holds
  the clean-up calls this plan reuses (lines 448–457).
- `packages/backend/convex/projectChatWorkflow.ts` — project chat.
  `cancelProjectChatExecution` (lines 732–845) is the shared cancel used by the
  Stop button, Steer (`_chat/steer.ts:96`) and mobile (`mobile.ts:142`).
- `packages/backend/convex/sandboxCleanup.ts` — grace-delete helpers. There is
  **no project grace-delete helper**: only `scheduleSessionSandboxGraceDelete`
  (line 40) and `scheduleTaskSandboxGraceDelete` (line 65). `projectFields` in
  `_validators/tableFields.ts` has no `sandboxDeleteAfter` field.
- `packages/backend/tests/prClosedProjectScope.test.ts` — convex-test file that
  already drives this webhook for a project; extend it.

`githubWebhook.ts:217-235` today:

```ts
  const currentBranch =
    project.branchName ??
    buildProjectBranchName(projectId, project.branchVersion);
  if (row.state === "merged" && row.headBranch === currentBranch) {
    const nextVersion = (project.branchVersion ?? 1) + 1;
    const deleteId = preferPersistedSandboxId({ sandboxId: project.sandboxId });
    if (deleteId) {
      await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
        sandboxId: deleteId,
        repoId: project.repoId,
      });
    }
    await ctx.db.patch(projectId, {
      sandboxId: undefined,
      lastSandboxActivity: undefined,
      branchVersion: nextVersion,
      branchName: buildProjectBranchName(projectId, nextVersion),
    });
  }
```

The task path, `githubWebhook.ts:329-345`:

```ts
  // A merged/closed PR makes the task read-only, so stop any live preview
  // sandbox now (mirrors the session archive) and then grace-delete it.
  if (
    task.reviewTaskSandboxStatus === "active" ||
    ...
    task.sandboxId !== undefined
  ) {
    await requestTaskSandboxStop(ctx, task._id);
  }
  if (task.sandboxId) {
    await scheduleTaskSandboxGraceDelete(ctx, { ...task, status: newStatus, updatedAt: now });
  }
```

`_projects/sandbox.ts:406-463` (abridged) — the shared stop path:

```ts
/**
 * Shared stop path for a project sandbox: the Stop button, the daily auto-stop
 * sweep and the idle sweep all go through here (mirrors
 * `requestSessionSandboxStop` / `requestTaskSandboxStop`), so every stop clears
 * the same leftover UI state. Callers own the auth check.
 */
export async function requestProjectSandboxStop(ctx, projectId, options = {}) {
  ...
  await scheduleFinalizeStopProject(ctx, { projectId, sandboxId: project.sandboxId, repoId: project.repoId, stopReason });

  // Clear leftover start steps so stop does not re-show startup activity.
  await clearSandboxStartupActivity(
    ctx.db,
    `project-sandbox-startup-${projectId}`,
  );

  // Stopping kills the paused turn, so any blocking AskUserQuestion can
  // never be claimed — move it onto the chat message so the card stays.
  await detachPendingQuestions(ctx.db, String(projectId));
  await clearPreviewToolCallsForParent(ctx.db, projectId);

  // Keep sandboxId so we can resume the stopped sandbox later.
  await ctx.db.patch(projectId, {
    reviewProjectSandboxStatus: "stopping",
  });
}
```

`projectChatWorkflow.ts:739-745` and `:842-844` — the cancel ends by draining
the queue:

```ts
export async function cancelProjectChatExecution(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<void> {
  await cancelTrackedWorkflow(ctx, project.activeChatWorkflowId);
  ...
  await ctx.db.patch(project._id, projectPatch);

  await startNextQueuedProjectChatMessage(ctx, project._id);
}
```

### Why not "stop, then grace-delete" like the task path

The lead for this plan said "mirror the task path". That does not fit
projects, for three reasons found in recon:

1. A project is not dead after a merge. It moves to a new branch version, so
   the old sandbox (checked out on the spent branch) must be deleted, not kept
   for resume. The existing immediate `deleteSandbox` is correct; keep it.
2. There is no project grace-delete helper and no `sandboxDeleteAfter` field
   on projects. Adding one is a schema change for no benefit.
3. `requestProjectSandboxStop` schedules `finalizeStopProjectSandbox`, which
   calls `stopSandbox` and then `markProjectSandboxClosed`. On a stop error,
   `markProjectSandboxClosed` (`_projects/sandbox.ts:559-595`) sets the status
   back to `"active"` and posts "Failed to stop sandbox". A stop racing the
   immediate delete can hit exactly that error. So this plan reuses the
   stop path's **clean-up** calls, not its provider stop.

### Why the cancel must not drain the queue here

`startNextQueuedChatMessage` with trigger `"turn-ended"`
(`_queues/helpers.ts:354-500`) starts the next queued workflow without
checking the sandbox state. The project chat workflow then fails with
"No active sandbox" (`projectChatWorkflow.ts:907-911`) because `sandboxId` is
gone, and the user's queued message is consumed. If the queue is left alone,
it drains when the user next starts the sandbox: `projectSandboxReady`
schedules `internal._queues.helpers.drainQueueQuietly`
(`_projects/sandbox.ts:691-701`).

### Import-cycle constraint

`_queues/helpers.ts:51` imports `wakeProjectSandboxForQueue` from
`_projects/sandbox.ts`, and `projectChatWorkflow.ts` imports
`_queues/helpers.ts`. So `_projects/sandbox.ts` must **not** import
`projectChatWorkflow.ts` (cycle; `tests/convexModuleCycleContract.test.ts`
fails). Call the cancel from `githubWebhook.ts` instead.

### Conventions that apply (quoted)

From `CLAUDE.md`:

- "No `any`, `unknown`, `as`, or non-null `!`."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions."
- "Eliminate duplication, centralise your changes so its easier to update them"
- "After medium+ changes: no banned types; `tsc` where relevant; `/changelog` (or `internal/changelog.md`)."

From `docs/eva-convex.md`:

- "Never manually define interfaces for Convex documents. Always import: `Doc<"tableName">`, `Id<"fieldName">`".

Changelog convention (`internal/changelog/README.md`): "New entries go at the
**top** of the current month's file, directly under its `# Changelog — <Month
YYYY>` heading. … Entry format: `## <Title> - <YYYY-MM-DD>` followed by
bullets describing what changed and why."

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `pnpm --filter @eva/backend typecheck` | exit 0, no errors |
| Target tests | `pnpm --filter @eva/backend test -- tests/prClosedProjectScope.test.ts tests/taskPrLifecycleContract.test.ts tests/convexModuleCycleContract.test.ts` | all pass |
| Chat cancel tests | `pnpm --filter @eva/backend test -- tests/chatCompletionFenceArgs.test.ts tests/cancelRace.test.ts tests/chatQueueStopAndWakeSurfaces.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

NEVER run `npx convex codegen`, `convex dev` or `convex deploy` — they upload
to a deployment. Do not run the full backend suite: five tests already fail
at planning time (`pendingQuestion`, `sessionStopRecoveryContract` ×3,
`providerAccountHandoffContract`) and are not yours to fix.

## Suggested executor toolkit

- `convex-rules` skill for Convex function conventions.
- Read `packages/backend/tests/prClosedProjectScope.test.ts` fully before
  writing tests; copy its fixture style.

## Scope

**In scope** (the only files you should modify):

- `packages/backend/convex/githubWebhook.ts`
- `packages/backend/convex/_projects/sandbox.ts`
- `packages/backend/convex/projectChatWorkflow.ts` (only the
  `cancelProjectChatExecution` signature and its last line)
- `packages/backend/tests/prClosedProjectScope.test.ts`
- `internal/changelog/2026-11.md` (or the current month's file)

**Out of scope** (do NOT touch):

- `packages/backend/convex/sandboxCleanup.ts` — no project grace-delete; see
  "Why not stop, then grace-delete".
- `applyQuickTaskPrClosed` and the session archive path — already correct.
- `packages/backend/convex/agentTaskChatWorkflow.ts` — the task chat has the
  same "cancel drains the queue" shape, but the task merge path does not
  cancel at all today; changing it is a separate decision.
- `_chat/surfaceAdapters.ts` `interrupt` functions — they duplicate part of
  the cancel logic; plan 016 handles that.
- Any schema or validator change.

## Git workflow

- Stay on the current branch. Do NOT create a branch, push, or open a PR
  unless the operator told you to.
- One commit for the code + tests, one for the changelog is fine; or one
  commit for both. Conventional commits, matching `git log`, e.g.
  `fix(projects): retire sandbox and chat turn when the branch PR merges`.

## Steps

### Step 1: Write the failing behaviour tests first

In `packages/backend/tests/prClosedProjectScope.test.ts`, add a new
`describe("a project's current-branch PR merging with a live sandbox", …)`
block after the existing `describe("a project pull request merging", …)`.
Reuse `fixture()`, `PROJECT_PR` and `TIMEOUT_MS`. Before calling the webhook,
patch the project and seed rows with `t.run`:

```ts
await t.run(async (ctx) => {
  await ctx.db.patch(ids.projectId, {
    sandboxId: "sbx_merged",
    reviewProjectSandboxStatus: "active",
    activeChatWorkflowId: "wf_live_turn",
  });
  // The turn's assistant message, then a blocking question it asked.
  await ctx.db.insert("messages", {
    parentId: ids.projectId,
    role: "assistant",
    content: "Which option?",
    timestamp: Date.now(),
  });
  await ctx.db.insert("pendingQuestions", {
    entityId: String(ids.projectId),
    toolUseId: "tool_1",
    payload: "{\"questions\":[]}",
    createdAt: Date.now(),
  });
  await ctx.db.insert("queuedMessages", {
    parentId: ids.projectId,
    content: "next thing",
    createdAt: Date.now(),
    order: Date.now(),
    userId: ids.ada,
  });
});
await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
  prUrl: PROJECT_PR,
  action: "closed",
  merged: true,
});
```

(If `queuedMessages` or `messages` needs more required fields, read
`queuedMessageFields` / `messageFields` in
`packages/backend/convex/_validators/tableFields.ts` and add only the required
ones.)

Write these tests (one `test(...)` each, all with `TIMEOUT_MS`):

1. "closes the sandbox status and forgets the sandbox" —
   `project.reviewProjectSandboxStatus === "closed"`,
   `project.sandboxId === undefined`, `project.branchVersion === 3`.
2. "ends the running chat turn" — `project.activeChatWorkflowId === undefined`.
3. "moves a blocking question onto the chat message" — no `pendingQuestions`
   rows with `entityId === String(ids.projectId)`, and the assistant message
   has `pendingQuestion === "{\"questions\":[]}"`.
4. "keeps queued messages for the next sandbox start" — the `queuedMessages`
   row still exists, and no `user` message with content `"next thing"` was
   inserted into `messages`.
5. "a project with no sandbox still merges cleanly" — run the webhook without
   the patch above; expect `reviewProjectSandboxStatus === "closed"` and
   `branchVersion === 3`.

**Verify**: `pnpm --filter @eva/backend test -- tests/prClosedProjectScope.test.ts`
→ the existing tests pass; new tests 1–4 FAIL (2 and 3 at least). Test 5
fails on the status assertion. If a new test passes before any code change,
STOP (the bug may already be fixed — see STOP conditions).

### Step 2: Let the cancel skip the queue drain

In `packages/backend/convex/projectChatWorkflow.ts`, change
`cancelProjectChatExecution` (line 739) to take an options object with a
default, and guard its last line (line 844):

```ts
export async function cancelProjectChatExecution(
  ctx: MutationCtx,
  project: Doc<"projects">,
  options: { drainQueue?: boolean } = {},
): Promise<void> {
  ...
  await ctx.db.patch(project._id, projectPatch);

  // A caller that is tearing the sandbox down keeps the queue for the next
  // start: draining now would launch a turn on a sandbox being deleted.
  if (options.drainQueue !== false) {
    await startNextQueuedProjectChatMessage(ctx, project._id);
  }
}
```

Update the JSDoc above it with one sentence on `drainQueue`. Do not change any
other line in the function. The three existing callers
(`cancelExecution` at line 860, `_chat/steer.ts:96`, `mobile.ts:142`) keep the
default and need no edit.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 3: Share the stop clean-up and add `retireProjectSandbox`

In `packages/backend/convex/_projects/sandbox.ts`:

1. Add a non-exported helper directly above `requestProjectSandboxStop`
   (line 406) that holds the three clean-up calls now at lines 448–457 (keep
   their comments):

   ```ts
   /** Clears the UI state a stopped or retired project sandbox leaves behind. */
   async function clearProjectSandboxLeftovers(
     ctx: MutationCtx,
     projectId: Id<"projects">,
   ): Promise<void> {
     // Clear leftover start steps so stop does not re-show startup activity.
     await clearSandboxStartupActivity(ctx.db, `project-sandbox-startup-${projectId}`);
     // Stopping kills the paused turn, so any blocking AskUserQuestion can
     // never be claimed — move it onto the chat message so the card stays.
     await detachPendingQuestions(ctx.db, String(projectId));
     await clearPreviewToolCallsForParent(ctx.db, projectId);
   }
   ```

2. In `requestProjectSandboxStop`, replace those three calls with
   `await clearProjectSandboxLeftovers(ctx, projectId);`. Order inside the
   function stays the same (after `scheduleFinalizeStopProject`, before the
   `"stopping"` patch).

3. Add an exported helper after `requestProjectSandboxStop`:

   ```ts
   /**
    * Retires the project sandbox for good: the merged branch it holds is spent,
    * so it is deleted, not stopped. A stop here would race the delete, and a
    * failed stop flips the status back to "active" (markProjectSandboxClosed).
    * Callers cancel any chat turn first; this module cannot import the chat
    * workflow (the queue helpers import this module).
    */
   export async function retireProjectSandbox(
     ctx: MutationCtx,
     project: Doc<"projects">,
   ): Promise<void> {
     const deleteId = preferPersistedSandboxId({ sandboxId: project.sandboxId });
     if (deleteId) {
       await ctx.scheduler.runAfter(0, internal.sandbox.deleteSandbox, {
         sandboxId: deleteId,
         repoId: project.repoId,
       });
     }
     await clearProjectSandboxLeftovers(ctx, project._id);
     await ctx.db.patch(project._id, {
       sandboxId: undefined,
       lastSandboxActivity: undefined,
       reviewProjectSandboxStatus: "closed",
     });
   }
   ```

   Import `preferPersistedSandboxId` from `"../_sandbox/resolveExistingSandboxId"`
   (the same helper `githubWebhook.ts:11` uses). Check that `Doc` is already
   imported (line 10: `import type { Doc, Id } from "../_generated/dataModel";`).

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0, and
`pnpm --filter @eva/backend test -- tests/convexModuleCycleContract.test.ts` → pass.

### Step 4: Use both in the webhook

In `packages/backend/convex/githubWebhook.ts`, replace the body of the
`if (row.state === "merged" && row.headBranch === currentBranch)` block
(lines 220–235) with:

```ts
  if (row.state === "merged" && row.headBranch === currentBranch) {
    // The merged branch is spent. End any chat turn on it first, without
    // starting a queued message (it would run on the sandbox being deleted);
    // the queue drains when the user next starts the sandbox.
    if (
      project.activeChatWorkflowId !== undefined ||
      project.pendingTurn !== undefined
    ) {
      await cancelProjectChatExecution(ctx, project, { drainQueue: false });
    }
    await retireProjectSandbox(ctx, project);
    const nextVersion = (project.branchVersion ?? 1) + 1;
    await ctx.db.patch(projectId, {
      branchVersion: nextVersion,
      branchName: buildProjectBranchName(projectId, nextVersion),
    });
  }
```

Imports: add `cancelProjectChatExecution` from `"./projectChatWorkflow"` and
`retireProjectSandbox` from `"./_projects/sandbox"`. Remove the
`preferPersistedSandboxId` import (line 11) only if nothing else in the file
uses it (`grep -n preferPersistedSandboxId packages/backend/convex/githubWebhook.ts`).

**Verify**:
- `pnpm --filter @eva/backend typecheck` → exit 0.
- `pnpm --filter @eva/backend test -- tests/prClosedProjectScope.test.ts tests/taskPrLifecycleContract.test.ts tests/convexModuleCycleContract.test.ts` → all pass, including the 5 new tests.
- `pnpm --filter @eva/backend test -- tests/chatCompletionFenceArgs.test.ts tests/cancelRace.test.ts tests/chatQueueStopAndWakeSurfaces.test.ts` → all pass.

### Step 5: Lint and changelog

Add an entry at the top of `internal/changelog/2026-11.md` (directly under
`# Changelog — November 2026`; use the current month's file if the month has
changed):

```markdown
## Project PR merge retires the sandbox and chat turn - <YYYY-MM-DD>

- Cause: merging the project's current-branch PR deleted the sandbox and cleared `sandboxId`, but left `reviewProjectSandboxStatus`, `activeChatWorkflowId` and pending questions behind, so the UI showed a live preview and a stuck "Working…" chat.
- `applyProjectPrEvent` now cancels the chat turn (`cancelProjectChatExecution` with `drainQueue: false`), then `retireProjectSandbox` deletes the sandbox, detaches questions and closes the status. Queued messages wait for the next sandbox start.
- `requestProjectSandboxStop` and the retire path share `clearProjectSandboxLeftovers`.
```

**Verify**: `pnpm lint` → exit 0.

## Test plan

- New tests in `packages/backend/tests/prClosedProjectScope.test.ts` (5 tests,
  listed in Step 1): status closed + sandbox cleared; chat workflow cleared;
  pending question moved onto the message; queued message kept; no-sandbox
  project still merges.
- Structural pattern: the existing `describe("a project pull request
  merging", …)` block in the same file (convex-test, `t.run` fixtures,
  `t.mutation(internal.githubWebhook.handlePullRequestEvent, …)`).
- Regression: existing tests in the same file, `taskPrLifecycleContract`,
  cancel/queue tests listed in Step 4.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `pnpm --filter @eva/backend test -- tests/prClosedProjectScope.test.ts` passes, with the 5 new tests
- [ ] The cancel/queue and cycle tests listed in Step 4 pass
- [ ] `pnpm lint` exits 0
- [ ] `grep -n "retireProjectSandbox\|drainQueue: false" packages/backend/convex/githubWebhook.ts` shows both
- [ ] `grep -n "clearProjectSandboxLeftovers" packages/backend/convex/_projects/sandbox.ts` shows 3 lines (definition + 2 calls)
- [ ] `git status` shows only in-scope files modified
- [ ] Changelog entry added; `plans/README.md` status row updated (if the file exists)

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above do not match the live code (drift).
- Any new test in Step 1 passes before you change code — the bug may already
  be fixed by another plan.
- `cancelProjectChatExecution` throws inside the webhook in a test (for
  example from `closeTurnForWorkflow` or `cancelTrackedWorkflow`). A throw
  rolls back the whole webhook mutation, so the PR row update would be lost.
  Do not wrap it in try/catch on your own — report it.
- `tests/convexModuleCycleContract.test.ts` fails after Step 3 or 4.
- The fix seems to need a schema change (for example a project
  `sandboxDeleteAfter`), or a change to `agentTaskChatWorkflow.ts`.

## Maintenance notes

- `cancelProjectChatExecution` closes the turn with the error text
  "Cancelled by the user" even on a merge. Changing that text needs a new
  option; it was left out to keep the diff small. Follow-up if users find it
  confusing.
- The quick-task merge path (`applyQuickTaskPrClosed`) still does not cancel a
  running task chat turn. Its `requestTaskSandboxStop` handles the sandbox,
  but `activeChatWorkflowId` stays until the watchdog. Worth a twin fix.
- Plan 016 (chat workflow consolidation) moves `cancelProjectChatExecution`
  into a shared module. It must keep the `drainQueue` option.
- Reviewer: check that the webhook cancels **before** `retireProjectSandbox`
  (the cancel reads `project.sandboxId` to kill a one-shot process), and that
  no queued turn is started.
- Plan 016 may also port task-style sandbox auto-start to project chat. Until
  then, a project chat message sent after a merge fails with "No active
  sandbox" until the user starts the sandbox.
