# Plan 012: One busy rule for quick-task chat, so a retry never starts a second agent beside the main run

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. If `plans/README.md` does not exist, do not create it;
> report your status in your final reply instead.
>
> **Drift check (run first)**:
> `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/_chat/turnProjection.ts packages/backend/convex/agentTaskChatWorkflow.ts packages/backend/convex/_queues/helpers.ts packages/backend/tests/taskChatBusyGuard.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/011-clear-pending-turn-on-release.md (recommended first; not a hard code dependency)
- **Category**: bug
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

A quick task's main run (`task.activeWorkflowId`) and its chat turns
(`task.activeChatWorkflowId`) run agents in the same sandbox. Three of the
four places that decide "can a new chat turn start now?" count the main run.
`retryLastTurnWithAccount` (the "retry on another account" button after a
usage-limit error) does not, so it can start a chat agent while the main run
is still working: two agents editing one checkout. Each site also spells the
rule out by hand, which is how the fourth copy drifted. This plan puts the
rule in one function and uses it everywhere on the task surface.

## Current state

Files:
- `packages/backend/convex/_chat/turnProjection.ts` — pure "is it executing" helpers; only type imports (`:1-2`). Holds `taskIsExecuting` (`:172-191`), whose comment already states the rule: "its main run and its chat turn share one sandbox, and the queue already treats them as exclusive."
- `packages/backend/convex/agentTaskChatWorkflow.ts` — quick-task chat mutations.
- `packages/backend/convex/_queues/helpers.ts` — chat queue; task config `taskChatQueueConfig` (`:874-...`).

The four task sites (verified):

1. `agentTaskChatWorkflow.ts:450-457`, `startExecute` (`:406`) — correct:
```ts
    // A send that lands behind a running turn queues: a burst of sends can all
    // reach here before the composer sees the first turn, and starting each
    // one ran two turns at once. Same busy rule as the queue's own drain.
    if (
      task.activeChatWorkflowId !== undefined ||
      task.activeWorkflowId !== undefined ||
      task.pendingTurn !== undefined
    ) {
```
2. `agentTaskChatWorkflow.ts:524-529`, `retryLastTurnWithAccount` (`:503`) — **the bug**, no `activeWorkflowId`:
```ts
    if (
      task.activeChatWorkflowId !== undefined ||
      task.pendingTurn !== undefined
    ) {
      throw new Error("A turn is already running");
    }
```
3. `agentTaskChatWorkflow.ts:603-609`, `retryEmptyStalledTurn` (`:590`) — correct:
```ts
      // One sandbox-busy rule: the task's main run blocks the retry as a
      // newer chat turn does.
      hasActiveWorkflow:
        task.activeChatWorkflowId !== undefined ||
        task.activeWorkflowId !== undefined ||
        task.pendingTurn !== undefined,
```
4. `_queues/helpers.ts:880-885`, `taskChatQueueConfig.hasActiveWorkflow` — counts both workflows, deliberately **not** `pendingTurn`:
```ts
  // `activeWorkflowId` counts too: the task's own run owns the sandbox, and a
  // follow-up may now be queued while that first run is still going. Starting
  // a chat turn on top of it would have two agents in one sandbox.
  hasActiveWorkflow: (task) =>
    task.activeChatWorkflowId !== undefined ||
    task.activeWorkflowId !== undefined,
```

### Why not make `isSurfaceBusy` the single source

`_queues/helpers.ts:211-238` `isSurfaceBusy` is async, takes a queue config,
and also counts capacity, running background subagents and open synthetic
turns. Reusing it in `retryLastTurnWithAccount` would change that mutation's
behaviour (a running subagent would block a retry) and would need the queue
config exported. That is a larger change than the bug needs. The smallest
correct option: two pure helpers in `turnProjection.ts`; the queue keeps its
`pendingTurn`-free rule but reads the shared workflow half.

### Project surface: no change in this plan (explicit decision)

`projectChatWorkflow.ts` busy checks (`:435-438` `startExecute`, `:503-508`
`retryLastTurnWithAccount`, `:582-584` `retryEmptyStalledTurn`, and the queue
`projectChatQueueConfig.hasActiveWorkflow` at `_queues/helpers.ts:770`) look
only at `activeChatWorkflowId` / `pendingTurn`. `projectIsExecuting`
(`_chat/turnProjection.ts:194-211`) also counts `activeWorkflowId` and
`activeBuildWorkflowId`. Evidence found:

- Builds do use the project sandbox: project task runs write it via `updateProjectSandbox` (`_taskWorkflow/runLifecycle.ts:185-198`).
- But project chat is **designed** to run beside them: `cancelProjectChatExecution` (`projectChatWorkflow.ts:751`) and the project adapter's `interrupt` (`_chat/surfaceAdapters.ts:336`) check `project.activeWorkflowId || project.activeBuildWorkflowId` and then kill only the chat daemon (`killEntityDaemon`) instead of every sandbox process, so the build survives a chat stop.
- `projectIsExecuting` is used for idle-pause and MCP status (`sandboxIdlePause.ts:402`, `mcp/queries.ts:655`, `:735`): "is anything running", not "may chat start".

So blocking project chat during a build or interview would be a product
change, not a parity fix. It is out of scope; see STOP conditions.

### Conventions (quoted)

From `CLAUDE.md`:
- "Eliminate duplication, centralise your changes so its easier to update them."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions."
- "No `any`, `unknown`, `as`, or non-null `!`."
- "Chat is one surface ... ship chat changes to all three panels and workflow modules." (The project surface is assessed above; sessions have no main run.)

From `docs/eva-convex.md`:
- "Never manually define interfaces for Convex documents. Always import: `Doc<\"tableName\">`." — use `Pick<Doc<"agentTasks">, ...>` like `taskIsExecuting` does.

Durable-workflow rule: do not rename or remove any export referenced by
`internal.*` paths. `retryEmptyStalledTurn` and `retryLastTurnWithAccount`
keep their names and args.

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Targeted tests | `pnpm --filter @eva/backend test -- tests/taskChatBusyGuard.test.ts tests/chatSurfaceUnificationContract.test.ts tests/usageLimitRetry.test.ts tests/chatQueueStuckCases.test.ts tests/convexModuleCycleContract.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

NEVER run `npx convex codegen`, `convex dev` or `convex deploy`. Five backend
tests already fail at planning time (`pendingQuestion`,
`sessionStopRecoveryContract` x3, `providerAccountHandoffContract`); not
yours. Run only the targeted files.

## Scope

**In scope**:
- `packages/backend/convex/_chat/turnProjection.ts` (add two functions)
- `packages/backend/convex/agentTaskChatWorkflow.ts` (three busy checks)
- `packages/backend/convex/_queues/helpers.ts` (`taskChatQueueConfig.hasActiveWorkflow` only)
- `packages/backend/tests/taskChatBusyGuard.test.ts` (create)
- `internal/changelog/2026-11.md` (one entry)

**Out of scope**:
- `projectChatWorkflow.ts` and `projectChatQueueConfig` — see "Project surface".
- `isSurfaceBusy` — see above.
- `_chat/steer.ts:81` `hasActiveTurn` — a different question (is there a turn to steer).
- `agentTaskChatWorkflow.ts:1429` (`handleCompletion`'s `pendingTurn` check) — different meaning.

## Git workflow

- Stay on the current branch. No branch, push or PR unless the operator says so.
- Conventional commit, e.g. `fix(chat): one task-chat busy rule; retry waits for the main run`.

## Steps

### Step 1: Add the helpers next to `taskIsExecuting`

In `_chat/turnProjection.ts`, directly above `taskIsExecuting`:

```ts
/**
 * A quick task's main run and its chat turn share one sandbox, so either
 * workflow blocks a new chat turn (two agents in one checkout otherwise).
 */
export function taskSandboxHasWorkflow(
  task: Pick<Doc<"agentTasks">, "activeWorkflowId" | "activeChatWorkflowId">,
): boolean {
  return (
    task.activeChatWorkflowId !== undefined ||
    task.activeWorkflowId !== undefined
  );
}

/** Busy for a new chat turn: a workflow on the sandbox, or a staged prompt. */
export function taskChatIsBusy(
  task: Pick<
    Doc<"agentTasks">,
    "activeWorkflowId" | "activeChatWorkflowId" | "pendingTurn"
  >,
): boolean {
  return taskSandboxHasWorkflow(task) || task.pendingTurn !== undefined;
}
```

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 2: Use `taskChatIsBusy` at the three mutation sites

In `agentTaskChatWorkflow.ts`, import `taskChatIsBusy` from
`./_chat/turnProjection`, then:
- `startExecute` (`:453-457`): `if (taskChatIsBusy(task)) {` — keep the comment above it.
- `retryLastTurnWithAccount` (`:524-529`): `if (taskChatIsBusy(task)) { throw new Error("A turn is already running"); }` — this is the behaviour fix.
- `retryEmptyStalledTurn` (`:606-608`): `hasActiveWorkflow: taskChatIsBusy(task),` — keep the comment.

**Verify**: `grep -n "task.activeWorkflowId !== undefined" packages/backend/convex/agentTaskChatWorkflow.ts` → no matches.
**Verify**: `grep -c "taskChatIsBusy(task)" packages/backend/convex/agentTaskChatWorkflow.ts` → `3`.

### Step 3: Use `taskSandboxHasWorkflow` in the queue

In `_queues/helpers.ts`, import `taskSandboxHasWorkflow` from
`../_chat/turnProjection` and set
`hasActiveWorkflow: taskSandboxHasWorkflow,` in `taskChatQueueConfig`. Keep
the existing comment. Do NOT switch the queue to `taskChatIsBusy`: the queue
deliberately ignores `pendingTurn`, and changing that is not verified here.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.
**Verify**: `pnpm --filter @eva/backend test -- tests/convexModuleCycleContract.test.ts` → pass.

### Step 4: Tests

Create `packages/backend/tests/taskChatBusyGuard.test.ts`:

1. Pure unit tests for `taskChatIsBusy` / `taskSandboxHasWorkflow` (build the
   argument as a plain object literal with only the picked fields): idle →
   false; only `activeWorkflowId` → true; only `activeChatWorkflowId` → true;
   only `pendingTurn: { prompt: "hi", requestedAt: 0 }` → `taskChatIsBusy`
   true, `taskSandboxHasWorkflow` false.
2. A convex-test, pattern from `tests/chatCompletionFenceArgs.test.ts:33-73`
   (`convexTest(schema, modules)`, `const modules = import.meta.glob("../convex/**/*.ts")`,
   30 s timeout): insert a user with a `clerkId`, a `githubRepos` row with
   `connectedBy: userId`, and an `agentTasks` row with `createdBy: userId` and
   `activeWorkflowId: "main-run"`. As that user
   (`t.withIdentity({ subject: CLERK_ID })`) call
   `api.agentTaskChatWorkflow.retryLastTurnWithAccount` with
   `{ taskId, providerAccountId: null }` → `rejects.toThrow("A turn is already running")`.
3. A source contract: the bodies of `startExecute`, `retryLastTurnWithAccount`
   and `retryEmptyStalledTurn` in `agentTaskChatWorkflow.ts` each contain
   `taskChatIsBusy(task)`. Slice with `export const ${name} =` … `"\n});"`
   like `tests/usageLimitRetry.test.ts:38-43`.

**Verify**: `pnpm --filter @eva/backend test -- tests/taskChatBusyGuard.test.ts` → all pass.
**Verify (red check)**: temporarily revert the `retryLastTurnWithAccount` change; the convex-test fails (no throw, or a different error from later code). Restore it.

### Step 5: Related tests, changelog, lint

Add one entry at the top of `internal/changelog/2026-11.md` under
`# Changelog — November 2026` (`## <Title> - YYYY-MM-DD` + bullets): the retry
now waits for the main run; one helper holds the rule; project chat
intentionally unchanged (chat stop already spares a running build).

**Verify**: the full "Targeted tests" command → all pass.
**Verify**: `pnpm lint` → exit 0.

## Test plan

- New `tests/taskChatBusyGuard.test.ts`: helper truth table (4 cases), retry refused while the main run is active (convex-test), contract that the three mutations use the helper.
- Existing, must still pass: `usageLimitRetry.test.ts`, `chatSurfaceUnificationContract.test.ts`, `chatQueueStuckCases.test.ts`.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] Targeted tests pass; `tests/taskChatBusyGuard.test.ts` exists with the cases above
- [ ] `grep -n "task.activeWorkflowId !== undefined" packages/backend/convex/agentTaskChatWorkflow.ts packages/backend/convex/_queues/helpers.ts` → no matches
- [ ] `git diff --stat` lists only in-scope files; `projectChatWorkflow.ts` unchanged
- [ ] Changelog entry added; `plans/README.md` row updated if it exists

## STOP conditions

- `retryLastTurnWithAccount` already checks `activeWorkflowId`, or any of the four sites no longer matches its excerpt.
- You believe the project surface must also block chat during `activeWorkflowId` / `activeBuildWorkflowId`. Do not change it. Report the evidence for the operator to decide: it is a product decision, because chat stop (`projectChatWorkflow.ts:751`) is built to run beside a build.
- Switching the queue to `taskSandboxHasWorkflow` changes any `chatQueue*` test result.
- `convexModuleCycleContract.test.ts` fails after the new imports.
- Typecheck needs `as`, `!`, `any` or `unknown`.

## Maintenance notes

- New task-chat entry points must call `taskChatIsBusy`; the queue uses `taskSandboxHasWorkflow`. If the queue should ever respect `pendingTurn`, switch it to `taskChatIsBusy` and test the drain after a stall (plan 011 clears the slot on release).
- Open product question (not decided here): should project chat wait for a running build or interview? Today it runs beside them by design.
- Reviewer focus: only `retryLastTurnWithAccount` changes behaviour; the other two task sites and the queue are pure refactors.
