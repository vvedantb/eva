# Plan 010: A failed one-shot launch ends the task and project chat turn with a visible error

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. If `plans/README.md` does not exist, do not create it;
> report your status in your final reply instead.
>
> **Drift check (run first)**:
> `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/agentTaskChatWorkflow.ts packages/backend/convex/projectChatWorkflow.ts packages/backend/convex/_sessions/workflow.ts packages/backend/tests/turnLifecycleContract.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

Eva has three chat surfaces (sessions, quick tasks, projects) and
`CLAUDE.md` says to "ship chat changes to all three panels and workflow
modules". The session workflow catches a failed one-shot launch
(`launchOnExistingSandbox`) and saves an error reply. The task and project
workflows do not. When the launch throws there (after the default action
retries), the durable workflow dies with no `saveResult`: the empty
placeholder and `activeChatWorkflowId` stay set, the chat shows "Working…",
and new messages queue behind it until the lease reconciler expires the turn
(startup lease: 15 minutes, `TURN_STARTUP_LEASE_MS` in
`_chat/turnLease.ts:6`). This plan copies the session catch to the other two
surfaces, so the user sees the error at once and the queue drains.

## Current state

Files:
- `packages/backend/convex/_sessions/workflow.ts` — session chat workflow `sessionExecuteWorkflow` (`:213`); the reference catch is at `:370-437`.
- `packages/backend/convex/agentTaskChatWorkflow.ts` — quick-task chat workflow `agentTaskChatExecuteWorkflow` (`:902`); one-shot branch `:1116-1154`, no catch.
- `packages/backend/convex/projectChatWorkflow.ts` — project chat workflow `projectChatExecuteWorkflow` (`:868`); one-shot branch `:1000-1038`, no catch. Local helper `saveFailure` at `:883-891`.
- `packages/backend/tests/turnLifecycleContract.test.ts` — pins each chat workflow's step list in source order (`chatWorkflowSteps`, `:85-132`).

The reference (sessions), `_sessions/workflow.ts:372-437` (abridged):

```ts
    } else {
      // A failed launch must finalize the turn: without this catch the
      // workflow dies after its step retries with no saveResult, leaving the
      // empty placeholder (and activeWorkflowId) stuck on "Working…" until
      // the 2-hour backstop.
      try {
        ...
        const turnLease = await step.runMutation(
          internal.turns.acquireOneShotLease,
          { turnId: args.turnId, sandboxId },
        );
        if (turnLease === null) {
          await step.runMutation(internal.sessionWorkflow.saveResult, { ... });
          return;
        }
        await step.runAction(internal.sandbox.launchOnExistingSandbox, { ... });
      } catch (error) {
        await step.runMutation(internal.sessionWorkflow.saveResult, {
          chatId: args.chatId,
          turnId: args.turnId,
          success: false,
          result: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to launch the agent on the sandbox. Please retry.",
          activityLog: null,
        });
        return;
      }
    }
```

So try/catch around `step.runAction` inside a workflow handler is the
established pattern here (added by commit `70fbc3ec4`
"fix(sessions): hard-exit one-shot runner and surface failed launches").
`workflowManager.ts:13` sets `retryActionsByDefault: true`, so the catch only
runs after the step's retries are spent.

Task, `agentTaskChatWorkflow.ts:1116-1154` (today, no catch):

```ts
    } else {
      const turnLease = await step.runMutation(
        internal.turns.acquireOneShotLease,
        { turnId: args.turnId, sandboxId: activeSandboxId },
      );
      if (turnLease === null) {
        await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
          taskId: args.taskId,
          turnId: args.turnId,
          success: false,
          result: null,
          error: "The turn no longer owns this task chat. Please retry.",
          activityLog: null,
        });
        return;
      }
      await step.runAction(internal.sandbox.launchOnExistingSandbox, {
        sandboxId: activeSandboxId,
        ...
        turnLeaseGeneration: turnLease.leaseGeneration,
      });
    }

    const result = await step.awaitEvent(agentTaskChatCompleteEvent);
```

Project, `projectChatWorkflow.ts:1000-1040`: the same shape with
`internal.projectChatWorkflow.saveResult` and `projectId: args.projectId`.
The project file already has this local helper (`:883-891`), used for other
failures in the same handler:

```ts
    const saveFailure = (error: string) =>
      step.runMutation(internal.projectChatWorkflow.saveResult, {
        projectId: args.projectId,
        turnId: args.turnId,
        success: false,
        result: null,
        error,
        activityLog: null,
      });
```

### Daemon (prewarm) branches: no change needed

`agentTaskChatWorkflow.ts:1094`, `projectChatWorkflow.ts:978` and
`_sessions/workflow.ts:358` call `prewarmEntityDaemon` /
`prewarmSessionDaemon` without a catch. Sessions deliberately left this
unwrapped, and it is safe: both actions go through `runPrewarmEntityDaemon`
(`_sandbox_runtime/execution.ts:1873`), whose whole body is in a
`try { ... } catch (error) { console.log(...skipped...); return { prewarmed: false }; }`
(`execution.ts:2188-2193`). The doc comment at `:2196-2199` says
"Best-effort: failures are swallowed." The step therefore does not throw on
sandbox errors; the staged `pendingTurn` is either claimed by a daemon or
expired by the lease reconciler. Adding a catch there would be dead code. Do
not touch the daemon branches.

### Durable-workflow journal rule

Workflow steps replay by position. A new step that runs only after a failed
launch is safe: in-flight workflows that already launched go straight to
`awaitEvent` and never reach it. Do NOT add, remove or reorder any other
`step.*` call, and do NOT rename any export referenced by `internal.*`.

`turnLifecycleContract.test.ts:134-160` extracts steps with
`/step\.(?:run\w+|awaitEvent)\(\s*(internal\.[\w.]+|\w+)/g` from the source
(comments included). Do not write `step.runMutation(` or similar inside a
comment. The same test requires every `.saveResult, {` to be followed by
`<entityId>: args.<x>,` then `turnId: args.turnId,`.

### Conventions (quoted)

From `CLAUDE.md`:
- "Chat is one surface: sessions, quick tasks and projects share `ChatBody`/`SandboxChatPreInput`; ship chat changes to all three panels and workflow modules."
- "No `any`, `unknown`, `as`, or non-null `!`."
- "Prefer simplicity, small diffs, co-location, explicit behavior."
- "After medium+ changes: no banned types; `tsc` where relevant; `/changelog` (or `internal/changelog.md`)."

From `docs/eva-convex.md`: "Avoid importing `process.env` helpers into Convex isolate workflow files." (Do not add any.)

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Targeted tests | `pnpm --filter @eva/backend test -- tests/turnLifecycleContract.test.ts tests/agentTurnContract.test.ts tests/chatSurfaceUnificationContract.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

NEVER run `npx convex codegen`, `convex dev` or `convex deploy`. Five backend
tests already fail at planning time (`pendingQuestion`,
`sessionStopRecoveryContract` x3, `providerAccountHandoffContract`); not
yours. Run only the targeted files.

## Scope

**In scope**:
- `packages/backend/convex/agentTaskChatWorkflow.ts` (one-shot branch only)
- `packages/backend/convex/projectChatWorkflow.ts` (one-shot branch only)
- `packages/backend/tests/turnLifecycleContract.test.ts`
- `internal/changelog/2026-11.md` (one entry)

**Out of scope**:
- `_sessions/workflow.ts` — already correct; read only.
- The prewarm/daemon branches (see "Current state").
- `_sandbox_runtime/execution.ts` — the launch action itself.
- Earlier steps (sandbox start, validation, `applyBranchPublishPolicy`): a different failure class; not this plan.

## Git workflow

- Stay on the current branch. No branch, push or PR unless the operator says so.
- Conventional commit, e.g. `fix(chat): finalize task and project turns when the one-shot launch fails`.

## Steps

### Step 1: Wrap the task one-shot launch

In `agentTaskChatWorkflow.ts`, inside the `else {` branch at `:1116`, wrap the
existing body (the `acquireOneShotLease` call, the `turnLease === null` block
and the `launchOnExistingSandbox` call) in `try { ... } catch (error) { ... }`,
exactly like sessions. Put the session comment (adapted: "activeChatWorkflowId")
above `try`. The catch:

```ts
      } catch (error) {
        await step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
          taskId: args.taskId,
          turnId: args.turnId,
          success: false,
          result: null,
          error:
            error instanceof Error
              ? error.message
              : "Failed to launch the agent on the sandbox. Please retry.",
          activityLog: null,
        });
        return;
      }
```

Do not change the arguments of any existing call.

Then in `tests/turnLifecycleContract.test.ts`, in `chatWorkflowSteps["../convex/agentTaskChatWorkflow.ts"]`,
insert `"internal.agentTaskChatWorkflow.saveResult",` directly after
`"internal.sandbox.launchOnExistingSandbox",` (`:109`).

**Verify**: `pnpm --filter @eva/backend test -- tests/turnLifecycleContract.test.ts` → all pass.

### Step 2: Wrap the project one-shot launch

Same wrap in `projectChatWorkflow.ts` (`else {` at `:1000`). In the catch, use
the existing helper so the failure path matches the rest of this handler:

```ts
      } catch (error) {
        await saveFailure(
          error instanceof Error
            ? error.message
            : "Failed to launch the agent on the sandbox. Please retry.",
        );
        return;
      }
```

Because `saveFailure` is defined once above, this adds no new `step.` text,
so the project journal list in the contract test stays the same.

**Verify**: `pnpm --filter @eva/backend test -- tests/turnLifecycleContract.test.ts` → all pass with no change to the project list.

### Step 3: Pin the catch on all three surfaces

In `tests/turnLifecycleContract.test.ts` add:

```ts
test.each([
  ["../convex/_sessions/workflow.ts", "sessionExecuteWorkflow"],
  ["../convex/agentTaskChatWorkflow.ts", "agentTaskChatExecuteWorkflow"],
  ["../convex/projectChatWorkflow.ts", "projectChatExecuteWorkflow"],
])("%s finalizes the turn when the one-shot launch throws", (path, name) => {
  // slice from `export const ${name} = workflow.define(` to the next "\nexport const "
  // leaseAt  = body.indexOf("internal.turns.acquireOneShotLease")
  // launchAt = body.indexOf("internal.sandbox.launchOnExistingSandbox")
  // tryAt    = body.lastIndexOf("try {", leaseAt)
  // catchAt  = body.indexOf("} catch (error) {", launchAt)
  // waitAt   = body.indexOf("step.awaitEvent(", launchAt)
  // expect all > -1; expect prewarm index < tryAt < leaseAt; expect catchAt < waitAt;
  // expect body.slice(catchAt, waitAt) to match /saveResult|saveFailure\(/
});
```

Write it as real code using the file's `source()` helper. For the prewarm
index use `body.indexOf("internal.sandbox.prewarm")` (matches both
`prewarmSessionDaemon` and `prewarmEntityDaemon`); this proves the `try` is
in the one-shot branch, not around the daemon branch. Note: for sessions,
`try {` comes before `waitForSessionSetup`, which is before
`acquireOneShotLease`, so `tryAt < leaseAt` holds.

**Verify**: `pnpm --filter @eva/backend test -- tests/turnLifecycleContract.test.ts` → all pass, 3 new cases.
**Verify (red check)**: temporarily remove the project catch; the project case fails. Restore it.

### Step 4: Typecheck, related contracts, changelog

Add one entry at the top of `internal/changelog/2026-11.md` under
`# Changelog — November 2026` (`## <Title> - YYYY-MM-DD` + bullets): cause
(no catch around `launchOnExistingSandbox` in task/project chat), fix (same
catch as sessions), why daemon branches are unchanged (prewarm swallows errors).

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.
**Verify**: `pnpm --filter @eva/backend test -- tests/turnLifecycleContract.test.ts tests/agentTurnContract.test.ts tests/chatSurfaceUnificationContract.test.ts` → all pass.
**Verify**: `pnpm lint` → exit 0.

## Test plan

- `tests/turnLifecycleContract.test.ts`: task journal gains one `saveResult` after `launchOnExistingSandbox`; new 3-case contract that the one-shot branch of every chat workflow is in a `try` whose `catch` saves a failed result before `awaitEvent`.
- A convex-test for this path is not practical: it needs the workflow component to run a real `launchOnExistingSandbox` that fails. The source contract matches how this repo pins workflow shape (`turnLifecycleContract.test.ts`, `agentTurnContract.test.ts`).

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] The three targeted test files pass; 3 new contract cases exist
- [ ] `grep -c "Failed to launch the agent on the sandbox" packages/backend/convex/agentTaskChatWorkflow.ts packages/backend/convex/projectChatWorkflow.ts` → 1 each
- [ ] `git diff 2042a0ac7 -- packages/backend/convex | grep "^-export const"` returns nothing
- [ ] `git diff --stat` lists only in-scope files
- [ ] Changelog entry added; `plans/README.md` row updated if it exists

## STOP conditions

- The one-shot branch no longer matches the excerpt (for example a catch already exists, or `saveFailure` was removed from `projectChatWorkflow.ts`).
- Making the journal test pass needs any change other than the single task `saveResult` insertion.
- `runPrewarmEntityDaemon` no longer ends in a catch that returns `{ prewarmed: false }` (then the daemon branches need the catch too — report, do not add it).
- Typecheck needs `as`, `!`, `any` or `unknown`.

## Maintenance notes

- If prewarm ever starts to throw (its catch is removed), the daemon branches on all three surfaces need the same catch.
- Reviewer focus: the `try` covers only the one-shot branch; `awaitEvent` stays outside the `try`; no step was reordered.
- Deferred: failures in earlier steps (`validateSandbox` with `retry: false` is already handled; `applyBranchPublishPolicy` is not) — a separate review.
