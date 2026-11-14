# Plan 011: Stall teardown clears the orphan `pendingTurn` on task and project chats

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. If `plans/README.md` does not exist, do not create it;
> report your status in your final reply instead.
>
> **Drift check (run first)**:
> `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/_chat/surfaceAdapters.ts packages/backend/tests/chatSurfaceUnificationContract.test.ts packages/backend/tests/turnLifecycleIntegration.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 012 touches the same busy checks; land 011 first)
- **Category**: bug
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

When a chat turn stalls, the shared teardown calls the surface adapter's
`release`. For sessions, `release` empties the `pendingTurn` handoff slot,
with a comment that explains why: no daemon claimed the prompt, and nothing
else ever empties the slot. The task and project adapters do not clear it.
The leftover slot then makes the task/project chat look busy forever to the
guards that read `pendingTurn !== undefined`: the empty-stall auto-retry that
the reconciler schedules right after the teardown never runs, and "retry with
another account" throws "A turn is already running". Clearing the slot in
the two `release` functions matches sessions and fixes both.

## Current state

Files:
- `packages/backend/convex/_chat/surfaceAdapters.ts` — per-surface adapters for the shared stall teardown. Session adapter `:124`, task `:219`, project `:306`; the three are exported at `:405`.
- `packages/backend/convex/_chat/stallWatchdog.ts` — `finalizeStaleChatTurn` (`:42`): closes the turn, then `adapter.release` (`:129-131`), then `adapter.drainQueue` (`:133`).
- `packages/backend/convex/turns.ts` — the lease reconciler: after `finalizeStaleChatTurn` it calls `adapter.afterStallFinalize` (`:486-488`), which schedules `retryEmptyStalledTurn`.
- `packages/backend/tests/chatSurfaceUnificationContract.test.ts` — the three-surface parity contract.
- `packages/backend/tests/turnLifecycleIntegration.test.ts` — convex-test integration of the turn lifecycle; already imports `taskChatAdapter` and `finalizeStaleChatTurn`.

Session `release`, `_chat/surfaceAdapters.ts:160-172` (correct):

```ts
  release: async (ctx, id, opts) => {
    // The dead turn's prompt is still sitting in the handoff slot whenever no
    // daemon claimed it, and nothing else ever empties that slot: claim and
    // saveResult are both paths this turn never reached. Left behind, the
    // orphan blocks `ensurePendingTurn` for every later turn, so the chat
    // opens turns no daemon can claim and stalls each one out forever.
    // Cleared before `drainQueue` restages the next message.
    await ctx.db.patch(id, {
      activeWorkflowId: undefined,
      syntheticTurnMessageId: undefined,
      pendingTurn: undefined,
      updatedAt: Date.now(),
    });
```

Task `release`, `_chat/surfaceAdapters.ts:263-281` (missing `pendingTurn`):

```ts
  release: async (ctx, id, opts) => {
    const patch: {
      activeChatWorkflowId: undefined;
      syntheticTurnMessageId: undefined;
      updatedAt: number;
      reviewTaskSandboxStatus?: "closed";
    } = {
      activeChatWorkflowId: undefined,
      syntheticTurnMessageId: undefined,
      updatedAt: Date.now(),
    };
    if (opts.sandboxStopped) {
      ...
      patch.reviewTaskSandboxStatus = "closed";
    }
    await ctx.db.patch(id, patch);
  },
```

Project `release`, `_chat/surfaceAdapters.ts:351-369`: identical shape with
`reviewProjectSandboxStatus`.

The guards that the orphan blocks (read only; do not edit here):

`agentTaskChatWorkflow.ts:603-609` (`retryEmptyStalledTurn`):
```ts
      hasActiveWorkflow:
        task.activeChatWorkflowId !== undefined ||
        task.activeWorkflowId !== undefined ||
        task.pendingTurn !== undefined,
```
`projectChatWorkflow.ts:582-584` (`retryEmptyStalledTurn`):
```ts
      hasActiveWorkflow:
        project.activeChatWorkflowId !== undefined ||
        project.pendingTurn !== undefined,
```
Also `retryLastTurnWithAccount` (`agentTaskChatWorkflow.ts:524-529`,
`projectChatWorkflow.ts:503-508`) and `startExecute`
(`agentTaskChatWorkflow.ts:453-457`, `projectChatWorkflow.ts:435-438`).

`pendingTurn` lives on the `agentTasks` / `projects` row itself (the task
daemon reads `task.pendingTurn` in `_chat/taskChatDaemon.ts:129-169`), so
patching the row is enough; there is no mirror table for these two surfaces.
The turn is already closed before `release` runs (`stallWatchdog.ts:124-127`),
so no live daemon can claim the cleared prompt.

### Conventions (quoted)

From `CLAUDE.md`:
- "Chat is one surface: sessions, quick tasks and projects share `ChatBody`/`SandboxChatPreInput`; ship chat changes to all three panels and workflow modules."
- "No `any`, `unknown`, `as`, or non-null `!`."
- "Prefer simplicity, small diffs, co-location, explicit behavior."
- "Eliminate duplication, centralise your changes so its easier to update them."

From `docs/eva-convex.md`: "Never manually define interfaces for Convex documents." (The local `patch` type literal already exists; extend it, do not replace it with a new interface.)

Durable-workflow rule: do not rename or remove any export referenced by
`internal.*` paths.

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Targeted tests | `pnpm --filter @eva/backend test -- tests/chatSurfaceUnificationContract.test.ts tests/turnLifecycleIntegration.test.ts tests/pendingTurnRecovery.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

NEVER run `npx convex codegen`, `convex dev` or `convex deploy`. Five backend
tests already fail at planning time (`pendingQuestion`,
`sessionStopRecoveryContract` x3, `providerAccountHandoffContract`); not
yours. Run only the targeted files.

## Scope

**In scope**:
- `packages/backend/convex/_chat/surfaceAdapters.ts` (task and project `release` only)
- `packages/backend/tests/chatSurfaceUnificationContract.test.ts`
- `packages/backend/tests/turnLifecycleIntegration.test.ts`
- `internal/changelog/2026-11.md` (one entry)

**Out of scope**:
- The busy guards in `agentTaskChatWorkflow.ts` / `projectChatWorkflow.ts` — plan 012.
- `finalizeOrphanTurn` in the adapters (synthetic turns never stage `pendingTurn`).
- `stallWatchdog.ts`, `turns.ts` — order of calls is already right.

## Git workflow

- Stay on the current branch. No branch, push or PR unless the operator says so.
- Conventional commit, e.g. `fix(chat): clear task and project pendingTurn on stall release`.

## Steps

### Step 1: Clear `pendingTurn` in the task and project `release`

In `_chat/surfaceAdapters.ts`, task `release` (`:263`): add
`pendingTurn: undefined;` to the `patch` type literal and
`pendingTurn: undefined,` to the object. Add a one-line comment pointing to
the session reason, e.g.
`// Same orphan as the session release above: no claim or saveResult will empty the slot.`
Do the same in the project `release` (`:351`).

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.
**Verify**: `grep -c "pendingTurn: undefined" packages/backend/convex/_chat/surfaceAdapters.ts` → previous count + 4 (run the same grep on `git show 2042a0ac7:packages/backend/convex/_chat/surfaceAdapters.ts` for the baseline).

### Step 2: Pin it in the parity contract

In `tests/chatSurfaceUnificationContract.test.ts`, add:

```ts
/**
 * A stalled turn's prompt stays in `pendingTurn` when no daemon claimed it.
 * Only the session release cleared it, so task and project chats looked busy
 * forever after a stall. Every surface's release must empty the slot.
 */
test.each(["sessionChat", "taskChat", "projectChat"])(
  "the %s adapter's release clears pendingTurn",
  (kind) => {
    // slice surfaceAdapters from `kind: "${kind}"` to the next `drainQueue:`
    // after it; inside that slice take from `release: async` to the end;
    // expect it to contain "pendingTurn: undefined"
  },
);
```

Write it as real code with the file's existing `surfaceAdapters` constant
(already comment-stripped by `readSource`). Use `expect(index).toBeGreaterThan(-1)`
guards like the other tests in the file.

**Verify**: `pnpm --filter @eva/backend test -- tests/chatSurfaceUnificationContract.test.ts` → all pass, 3 new cases.
**Verify (red check)**: temporarily remove `pendingTurn: undefined,` from the project `release`; the `projectChat` case fails. Restore it.

### Step 3: Add an integration test

In `tests/turnLifecycleIntegration.test.ts`, inside
`describe("task chat turns share the session turn lifecycle", ...)`, add a
test modelled on "the legacy heartbeat teardown closes the turn it tears down"
(`:522-546`):

1. `createTaskChatFixture()`.
2. In `t.run`: patch the turn with `workflowId: "chat-workflow"`; patch the task with `activeChatWorkflowId: "chat-workflow"` and `pendingTurn: { prompt: "hi", requestedAt: Date.now(), turnId }`; load the task; call `finalizeStaleChatTurn(ctx, taskChatAdapter, taskId, task, "chat-workflow", { text: STALL_ALERT_TEXT }, { sandboxStopped: true })`.
3. Read the task back; expect `pendingTurn` and `activeChatWorkflowId` to be `undefined`.

Use `sandboxStopped: true` so no interrupt is scheduled (same as the existing
test). Add the same test for a project: insert a `projects` row with the
fields used in `tests/chatCompletionFenceArgs.test.ts:58-66`
(`repoId, userId, title, phase: "in_progress", rawInput, updatedAt`), open a
turn with `openTurn` (already imported) and `streamingEntityId`
`` `${PROJECT_CHAT_STREAM_PREFIX}${String(projectId)}` `` (export of `_chat/surfaceAdapters.ts:26`), import `projectChatAdapter` and `PROJECT_CHAT_STREAM_PREFIX` next to
`taskChatAdapter`, and assert the same. If `finalizeStaleChatTurn` needs a
project placeholder message, insert one with `parentId: projectId` like the
task fixture does.

**Verify**: `pnpm --filter @eva/backend test -- tests/turnLifecycleIntegration.test.ts` → all pass, 2 new tests.

### Step 4: Related tests, changelog, lint

Add one entry at the top of `internal/changelog/2026-11.md` under
`# Changelog — November 2026` (`## <Title> - YYYY-MM-DD` + bullets): cause,
fix, and that sessions already did this.

**Verify**: `pnpm --filter @eva/backend test -- tests/chatSurfaceUnificationContract.test.ts tests/turnLifecycleIntegration.test.ts tests/pendingTurnRecovery.test.ts` → all pass.
**Verify**: `pnpm lint` → exit 0.

## Test plan

- Contract (`chatSurfaceUnificationContract.test.ts`): all three `release` bodies contain `pendingTurn: undefined`.
- Integration (`turnLifecycleIntegration.test.ts`): a stalled task turn and a stalled project turn with a staged `pendingTurn` end with the slot empty.
- Existing, must still pass: `pendingTurnRecovery.test.ts` ("session chat release clears pendingTurn on the chat row").

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] The three targeted test files pass; 3 new contract cases and 2 new integration tests exist
- [ ] `git diff --stat` lists only in-scope files
- [ ] `git diff 2042a0ac7 -- packages/backend/convex | grep "^-export"` returns nothing
- [ ] Changelog entry added; `plans/README.md` row updated if it exists

## STOP conditions

- Either `release` already clears `pendingTurn`, or `pendingTurn` moved off the `agentTasks` / `projects` row (for example into a daemon-state table like sessions' `sessionDaemonState`).
- `finalizeStaleChatTurn` no longer closes the turn before `release` (then clearing the slot could drop a prompt a live daemon is about to claim).
- The integration test cannot run without changing production code beyond Step 1.
- Typecheck needs `as`, `!`, `any` or `unknown`.

## Maintenance notes

- Any new chat surface adapter must clear its handoff slot in `release`; the Step 2 contract enforces it for the three current kinds.
- Reviewer focus: only `release` changed; `finalizeOrphanTurn` and `drainQueue` untouched.
- Related: plan 012 centralises the task busy rule that reads `pendingTurn`.
