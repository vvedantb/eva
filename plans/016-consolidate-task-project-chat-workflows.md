# Plan 016: Task chat and project chat run on one shared backend implementation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (if that file exists) — unless a reviewer dispatched
> you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/agentTaskChatWorkflow.ts packages/backend/convex/projectChatWorkflow.ts packages/backend/convex/_chat/taskChatDaemon.ts packages/backend/convex/_chat/projectChatDaemon.ts packages/backend/convex/_chat/surfaceAdapters.ts packages/backend/convex/_projects/sandbox.ts packages/backend/convex/_agentTasks/sandbox.ts packages/backend/tests/turnLifecycleContract.test.ts chat-in-sandbox-for-projects-and-tasks.md`
> This plan depends on plans 001, 010, 011, 012 and 013, which edit these same
> files. **Changes from those plans are expected.** For each changed file,
> re-read the functions named in "Current state" and update your mental map;
> a STOP is only needed if a function listed below no longer exists, or a
> drift item in the "Known drift" table is already gone or reversed.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (durable workflow journals; public function paths used by
  the web app and by sandbox daemons)
- **Depends on**: `plans/001-*.md` (backend suite green), `plans/010-*.md`,
  `plans/011-*.md`, `plans/012-*.md`,
  `plans/013-teardown-project-sandbox-on-merge.md` — all must be DONE first
  (they patch the functions this plan moves).
- **Category**: tech-debt
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

`convex/agentTaskChatWorkflow.ts` (1617 lines) and
`convex/projectChatWorkflow.ts` (1461 lines) export the same functions. With
entity names normalised, 1322 lines are identical: 81 % of the task file and
90 % of the project file. `_chat/taskChatDaemon.ts` (474) and
`_chat/projectChatDaemon.ts` (466) share 448 lines (94 % / 96 %). Every chat
fix must be made twice, and it often is not: the two copies have already
drifted (see "Known drift"). The visible case: task chat starts a closed
sandbox by itself, while project chat with no sandbox fails with "No active
sandbox. Start the project sandbox before sending chat messages." After this
plan, one implementation in `convex/_chat/` serves both surfaces through a
small per-surface adapter. Both modules keep every export (as thin wrappers),
so the web app, sandbox daemons and in-flight workflows see no change. Real
behaviour differences stay, but as named adapter fields, not as silent copy
drift.

## Current state

### Decision history (read this first)

- `chat-in-sandbox-for-projects-and-tasks.md` (repo root), the original
  design, says at line 9: "Backend duplicates session workflow patterns
  rather than introducing a polymorphic dispatcher." and at line 14:
  "Mirror the session message + workflow pipeline for projects and tasks
  (duplicate, do not abstract)." Line 162 lists as deferred:
  "Polymorphic workflow dispatcher (chosen duplicate-pattern path; revisit
  when there are 3+ parent types and duplication hurts)."
- `CLAUDE.md` now says: "Eliminate duplication, centralise your changes so
  its easier to update them" and "Chat is one surface: sessions, quick tasks
  and projects share `ChatBody`/`SandboxChatPreInput`; ship chat changes to
  all three panels and workflow modules."
- **The maintainer selected this consolidation plan on 2026-11-09.** Step 1
  marks the old design doc superseded.
- Prior art on the frontend: commit
  `4c74cfe9e refactor(chat): one sandbox chat module for tasks and projects (#1097)`
  (frontend only: `apps/web/src/lib/components/chat/SandboxChatPanel.tsx`,
  `sandboxChatBinding.ts`, `sandboxChatTurn.ts`). Its pattern: "Everything
  that differs between a task and a project sandbox chat" lives in one
  per-entity `SandboxChatBinding`; the shared panel does the rest. This plan
  does the same for the backend.
- Prior art on the backend: `convex/_chat/surfaceAdapters.ts` already has a
  closure-shaped `ChatSurfaceAdapter<TId, TEntity>` (lines 48–104) with
  `taskChatAdapter` (219–304) and `projectChatAdapter` (306–392), used by the
  stall watchdog and turn lease code. Its doc comment: "Read/write access to
  the entity is deliberately closure-shaped — every function that touches
  `ctx.db` for the entity's own table lives inside the adapter, so the
  generic shared code only ever calls opaque functions instead of writing
  table-specific patches itself." Follow that rule.

### The two modules (line numbers at `2042a0ac7`)

| Family | `agentTaskChatWorkflow.ts` | `projectChatWorkflow.ts` |
|---|---|---|
| Prompt build (stays per surface) | `buildTaskChatTurnPrompt` 96 | `buildProjectChatTurnPrompt` 86 |
| Stream id | `chatStreamEntityId` 92 | `chatStreamEntityId` 186 |
| Turn start | `stageAndStartTaskChatTurn` 199, `startExecute` 406, `retryLastTurnWithAccount` 503, `retryEmptyStalledTurn` 590 | `stageAndStartProjectChatTurn` 195, `startExecute` 391, `retryLastTurnWithAccount` 485, `retryEmptyStalledTurn` 569 |
| Send / queue | `addMessage` 336, `enqueueMessage` 632, `sendTaskChatMessage` 677, `enqueueTaskChatMessage` 714 | `addMessage` 327, `enqueueMessage` 608, `sendProjectChatMessage` 648, `enqueueProjectChatMessage` 685 |
| Cancel | `cancelTaskChatExecution` 770, `cancelExecution` 879 | `cancelProjectChatExecution` 739, `cancelExecution` 848 |
| Workflow | `agentTaskChatCompleteEvent` 328, `agentTaskChatExecuteWorkflow` 902–1204 | `projectChatCompleteEvent` 319, `projectChatExecuteWorkflow` 868–1084 |
| Result | `addAssistantPlaceholder` 1209, `getChatData` 1257, `saveResult` 1319, `handleCompletion` 1398 | `addAssistantPlaceholder` 1089, `getChatData` 1106, `saveResult` 1162, `handleCompletion` 1242 |
| Prewarm | `prewarmChatDaemon` 1464, `prewarmChatDaemonNow` 1520, `getChatPrewarmData` 1555 | `prewarmChatDaemon` 1307, `prewarmChatDaemonNow` 1365, `getChatPrewarmData` 1400 |
| Task only | `markTaskSandboxStartingForChat` 1230 | — |
| Daemon re-exports | 1609–1617 from `./_chat/taskChatDaemon` | 1453–1461 from `./_chat/projectChatDaemon` |

Daemon files: `_chat/taskChatDaemon.ts` and `_chat/projectChatDaemon.ts`
each export `claimPendingTurn` (63), `updateBackgroundAgents` (183),
`updateGoal` (219), `requestStopBackgroundAgent` (237), `openSyntheticTurn`
(262), `completeSyntheticTurn` (317), `ensurePendingTurn` (421 / ~412).

### Who calls these by path (none of these may change)

- Web app, via `api.agentTaskChatWorkflow.*` / `api.projectChatWorkflow.*`:
  `addMessage`, `cancelExecution`, `enqueueMessage`, `handleCompletion`,
  `prewarmChatDaemon`, `prewarmChatDaemonNow`, `requestStopBackgroundAgent`,
  `retryLastTurnWithAccount`, `startExecute`.
- Sandbox daemons, by string path, from
  `convex/_sandbox_runtime/daemonPaths.ts:185-200`:

  ```ts
  export const TASK_CHAT_DAEMON_MUTATIONS: DaemonMutationEnv = {
    claimMutation: "agentTaskChatWorkflow:claimPendingTurn",
    openSyntheticTurnMutation: "agentTaskChatWorkflow:openSyntheticTurn",
    completeSyntheticTurnMutation: "agentTaskChatWorkflow:completeSyntheticTurn",
    updateBackgroundAgentsMutation: "agentTaskChatWorkflow:updateBackgroundAgents",
    updateGoalMutation: "agentTaskChatWorkflow:updateGoal",
  };
  ```

  (and the `projectChatWorkflow:*` twin), plus
  `completionMutation: "agentTaskChatWorkflow:handleCompletion"`.
- Backend: `internal.agentTaskChatWorkflow.agentTaskChatExecuteWorkflow` and
  `internal.projectChatWorkflow.projectChatExecuteWorkflow` (queue start),
  `internal.*.retryEmptyStalledTurn` (`_chat/surfaceAdapters.ts:292,380`).
  Plain imports: `cancelTaskChatExecution` / `cancelProjectChatExecution`
  (`_chat/steer.ts:7-8`, `mobile.ts:13-14`), `sendTaskChatMessage` /
  `sendProjectChatMessage` (`mobile.ts:97,106`).
- **Workflow journals.** `@convex-dev/workflow` 0.3.10 replays a workflow by
  comparing each step with its journal entry
  (`node_modules/@convex-dev/workflow/dist/client/step.js:77-86`):

  ```js
  const stepJson = JSON.stringify(convexToJson(pick(entry.step, ["name", "args", "kind"])));
  const messageJson = JSON.stringify(convexToJson({ name: message.name, args: message.target.args, kind: message.target.kind }));
  if (stepJson !== messageJson) {
      throw new Error(`Journal entry mismatch: ${stepJson} !== ${messageJson}`);
  }
  ```

  So for every in-flight chat turn, the refactored code must call the **same
  function names**, with **the same args, in the same key order**, in the
  **same sequence**. `JSON.stringify` keeps insertion order, so
  `{ taskId, turnId, success, … }` and `{ turnId, taskId, success, … }` do
  not match. The existing guard
  `packages/backend/tests/turnLifecycleContract.test.ts:80-160` pins each
  workflow's step list in source order and says: "Steps replay by position,
  so an in-flight workflow strands if one call is added, removed or moved."

Because every path above stays registered where it is, the "thin shims" in
this plan are permanent wrappers, not temporary ones. Nothing is renamed or
removed, so there is no shim-removal follow-up.

### Known drift (verified with a normalised diff at `2042a0ac7`)

Method used (you can repeat it; write output to a scratch dir outside the
repo): `sed -E 's/agentTasks/ENTS/g; s/projects/ENTS/g; s/AgentTask|agentTask/Ent/g; s/Project/Ent/g; s/project/ent/g; s/Task/Ent/g; s/task/ent/g'`
on each file, then `diff`. Line numbers below are in the original files.

| # | Difference | Task | Project | Kind |
|---|---|---|---|---|
| D1 | Sandbox auto-start in the workflow | starts a closed sandbox (`agentTaskChatWorkflow.ts:929-996`, `markTaskSandboxStartingForChat` 1225–1255, `getChatData` returns `baseBranch` 1272/1295–1310) or waits for a starting one (`waitForTaskPreviewSandboxActive`, `_agentTasks/sandbox.ts:766`) | none. With `sandboxId` set it thaws through `ensureSandboxStartedSteps` without flipping status to `"starting"`; with no `sandboxId` it fails: "No active sandbox. Start the project sandbox before sending chat messages." (`projectChatWorkflow.ts:907-911`). No `waitForProjectPreviewSandboxActive` exists. | **Behaviour gap** — Step 11 only, gated |
| D2 | Failure helper | inlines `step.runMutation(internal.agentTaskChatWorkflow.saveResult, {…success:false…})` 7 times | `saveFailure` closure (`projectChatWorkflow.ts:883-891`) | Code shape only; same journal |
| D3 | `sentViaOrchestrator` arg | `addMessage` 348/389, `enqueueMessage` 646, `enqueueTaskChatMessage` 729/749 | absent | Real (orchestrator only messages tasks) — adapter flag or optional arg |
| D4 | Daemon-pull staging guard in `stageAndStart…` | `usesDaemonPull && task.sandboxId && task.repoId && status !== "closed" && status !== "stopping"` (276–282) | `usesDaemonPull && project.sandboxId` (273) | **Unexplained drift** — preserve per surface, flag |
| D5 | Busy rule in `startExecute` / `retryEmptyStalledTurn` | also `task.activeWorkflowId !== undefined` (455, 607: "the task's main run blocks the retry") | no main-run check | Real (tasks have a main run) — adapter predicate |
| D6 | `lastSandboxActivity` touch | field does not exist on tasks | `saveResult` 1219; `projectChatDaemon.ts` 202, 300, 397 | Real — adapter hook |
| D7 | `prewarmChatDaemon` `userId` | `ctx.userId` (1484) | `project.userId` (1329) | **Unexplained drift** — preserve per surface, flag |
| D8 | Cancel kill branch | `task.sandboxId && task.repoId`, `if (task.activeWorkflowId)` (781–782) | `project.sandboxId`, `if (project.activeWorkflowId \|\| project.activeBuildWorkflowId)` (750–751) | Real (projects have a build workflow) — adapter predicate |
| D9 | Owner and repo | `task.createdBy`, `task.repoId` optional (many `!task.repoId \|\|` guards) | `project.userId`, `repoId` required | Real — adapter accessors |
| D10 | Prompt content | tags, `taskNumber`, status, `resolveTaskBranchName`, `taskPrUrl` | `generatedSpec`, `branchName ?? buildProjectBranchName`, `project.prUrl` | Real — stays in per-surface prompt builders |
| D11 | Interrupt predicate in `surfaceAdapters.ts` | `provider === "claude"` (243) vs cancel's `usesChatDaemon(...)` (claude, codex, cursor) | same split (330 vs `projectChatWorkflow.ts:748`) | **Unexplained drift** across files — out of scope, flag |
| D12 | Plan 013 | — | `cancelProjectChatExecution(ctx, project, { drainQueue })` option | Must survive the move |

Rule for this plan: **a refactor step never changes behaviour.** Every row
marked "Real" or "Unexplained" becomes an explicit per-surface adapter field
that reproduces today's behaviour exactly. D1 is the only behaviour change,
in its own gated step. D4, D7 and D11 are reported, not fixed.

### Conventions that apply (quoted)

From `CLAUDE.md`:

- "No `any`, `unknown`, `as`, or non-null `!`. … Hard types → rethink design."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary."
- "Eliminate duplication, centralise your changes so its easier to update them"
- "Chat is one surface: sessions, quick tasks and projects share `ChatBody`/`SandboxChatPreInput`; ship chat changes to all three panels and workflow modules."
- "After medium+ changes: no banned types; `tsc` where relevant; `/changelog` (or `internal/changelog.md`)."
- "Before a PR that touches async code, run `/parallel-awaits` with `--diff origin/main`." (only if the operator asks you to open a PR)

From `docs/eva-convex.md`:

- "Never manually define interfaces for Convex documents. Always import: `Doc<"tableName">`, `Id<"fieldName">`, `FunctionReturnType<typeof api.functionName>`"
- "Single source of truth for table fields … Never duplicate field definitions between schema and return validators." Apply the same idea to arg validators: shared arg validator objects live in the shared module and both wrappers spread them.
- "Avoid importing `process.env` helpers into Convex isolate workflow files."

Durable workflow rule (from the operator): renaming or removing an exported
function referenced via `internal.*` breaks in-flight workflow journals —
keep old exports as thin shims for at least one deploy. (In this plan they
stay permanently.)

Import cycles: `packages/backend/tests/convexModuleCycleContract.test.ts`
fails on any import cycle among convex modules. The new shared modules in
`convex/_chat/` must **never** import `agentTaskChatWorkflow.ts`,
`projectChatWorkflow.ts`, `_chat/taskChatDaemon.ts` or
`_chat/projectChatDaemon.ts`. Wrappers import shared code; never the other
way. Use `internal.*` references (from `_generated/api`) for function
handles.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `pnpm --filter @eva/backend typecheck` | exit 0, no errors |
| Chat test set (run after every step) | `pnpm --filter @eva/backend test -- tests/turnLifecycleContract.test.ts tests/turnLifecycleIntegration.test.ts tests/chatSurfaceUnificationContract.test.ts tests/chatResultUnificationContract.test.ts tests/codeStructureServicesContract.test.ts tests/codexAppServerRoutingContract.test.ts tests/chatCompletionFenceArgs.test.ts tests/daemonClaimAcceptTurn.test.ts tests/daemonClaimPauseContract.test.ts tests/mcpSendChatMessage.test.ts tests/orchestratorDeliveryContract.test.ts tests/pendingTurnRecovery.test.ts tests/sendBurstQueuesBehindRunningTurn.test.ts tests/sessionPublishContract.test.ts tests/sessionTurnLaunchTraitsContract.test.ts tests/streamingDestinationContract.test.ts tests/syntheticTurnModelStamp.test.ts tests/turnCheckpointCompletionContract.test.ts tests/turnStagingContract.test.ts tests/usageLimitRetry.test.ts tests/providerAccountHandoffContract.test.ts tests/convexModuleCycleContract.test.ts tests/chatQueueStopAndWakeSurfaces.test.ts tests/cancelRace.test.ts tests/prClosedProjectScope.test.ts tests/sandboxChatJournal.test.ts tests/sandboxChatParity.test.ts` | all pass |
| Full backend suite | `pnpm --filter @eva/backend test` | all pass (plan 001 made it green) |
| Lint | `pnpm lint` | exit 0 |

Below, "the chat test set" means the second row. Before Step 2 the last two
files do not exist yet; drop them from the command until then.

NEVER run `npx convex codegen`, `convex dev` or `convex deploy` (they
upload). Adding or removing exports in existing modules needs no codegen.

## Suggested executor toolkit

- `code-structure` skill ("Use when multiple workflows duplicate the same
  operational logic").
- `convex-dev-workflow` skill (durable workflow rules and journal replay).
- `principle-sequence-verifiable-units` skill for the per-family steps.
- Read before starting: `convex/_chat/surfaceAdapters.ts` in full,
  `tests/turnLifecycleContract.test.ts:80-200`,
  `tests/prepareSandboxHalfPreparedCleanup.test.ts:1-90` (fake `WorkflowCtx`
  pattern), `tests/chatCompletionFenceArgs.test.ts` (both surfaces through
  convex-test).

## Scope

**In scope** (the only files you should modify or create):

- `chat-in-sandbox-for-projects-and-tasks.md` (one line at the top)
- `packages/backend/convex/agentTaskChatWorkflow.ts`
- `packages/backend/convex/projectChatWorkflow.ts`
- `packages/backend/convex/_chat/taskChatDaemon.ts`
- `packages/backend/convex/_chat/projectChatDaemon.ts`
- `packages/backend/convex/_chat/sandboxChatSurface.ts` (create: adapter type + two instances)
- `packages/backend/convex/_chat/sandboxChatDaemon.ts` (create: shared daemon mutation bodies)
- `packages/backend/convex/_chat/sandboxChatTurn.ts` (create: shared send/queue/start/cancel/result/prewarm bodies)
- `packages/backend/convex/_chat/sandboxChatWorkflow.ts` (create: shared workflow runner)
- Step 11 only: `packages/backend/convex/_projects/sandbox.ts`
- Tests: `packages/backend/tests/sandboxChatJournal.test.ts` (create),
  `packages/backend/tests/sandboxChatParity.test.ts` (create), and the
  existing source-contract tests listed in the chat test set **only** to
  repoint a file path at the new shared module (never to weaken an
  assertion).
- `internal/changelog/2026-11.md` (or the current month's file)

If one of the four new shared files grows past ~600 lines, split by family
(for example `sandboxChatSend.ts`, `sandboxChatResult.ts`) rather than
growing one file.

**Out of scope** (do NOT touch):

- `convex/_chat/surfaceAdapters.ts` behaviour (you may import its adapters;
  do not change `ChatSurfaceAdapter`, the session adapter, or the
  `interrupt` predicates — D11 is reported only).
- `convex/_sandbox_runtime/daemonPaths.ts` — daemon string paths must not
  change.
- Session chat (`sessionWorkflow.ts`, `_sessions/*`) — a third surface for a
  later plan.
- The frontend (`apps/web`) — public API names and arg shapes do not change.
- `buildTaskChatTurnPrompt` / `buildProjectChatTurnPrompt` content (D10).
- Fixing D4, D7 or D11 — report them in Maintenance notes.

## Git workflow

- Stay on the current branch. Do NOT create a branch, push, or open a PR
  unless the operator told you to.
- One commit per step. Conventional commits, matching `git log` (e.g.
  `refactor(chat): one sandbox chat module for tasks and projects (#1097)`):
  - `docs(chat): mark the duplicate-chat design superseded`
  - `test(chat): pin task and project chat journals and behaviour`
  - `refactor(chat): share sandbox chat daemon mutations`
  - … one per family …
  - `feat(projects): project chat starts a closed sandbox` (Step 11, only if approved)
- Each commit must pass typecheck and the chat test set on its own, so any
  step can be reverted alone.

## Steps

### Step 0: Confirm the preconditions

1. `plans/README.md` (if present) shows plans 001, 010, 011, 012, 013 as
   DONE. If the file is missing, ask the operator to confirm those five plans
   have landed. If any is not DONE: STOP.
2. `pnpm --filter @eva/backend test` → all pass (plan 001's promise). If not:
   STOP and report the failing files.
3. Re-run the normalised diff (method above) on the current files and check
   that D1–D12 still exist as described. Note any new drift introduced by
   plans 010–013 and add it to your own copy of the table; every new drift
   item also becomes an adapter field. If a drift item has disappeared, that
   is fine — note it.

**Verify**: the three checks above pass; no files changed (`git status` clean).

### Step 1: Mark the old design superseded

Insert this single line as the new first line of
`chat-in-sandbox-for-projects-and-tasks.md` (above `# Chat-in-sandbox for
projects and tasks`), followed by one blank line:

```markdown
> **Superseded 2026-11-09** for the backend: task and project chat now share one implementation (see `plans/016-consolidate-task-project-chat-workflows.md`); "duplicate, do not abstract" no longer applies.
```

Change nothing else in that file.

**Verify**: `git diff --stat` → 1 file, 2 insertions. Commit.

### Step 2: Characterisation tests (before any refactor)

#### 2a. Make each workflow handler callable (pure move)

In each module, move the `handler` body of the `workflow.define({...})` into
a named exported function in the **same file**, directly above the
`workflow.define`:

```ts
/** The task chat turn. Exported so tests can replay it with a fake step. */
export async function runAgentTaskChatTurn(
  step: WorkflowCtx,
  args: AgentTaskChatTurnArgs,
): Promise<void> {
  // ← the old handler body, unchanged, character for character
}

export const agentTaskChatExecuteWorkflow = workflow.define({
  args: agentTaskChatTurnArgs,
  handler: (step, args) => runAgentTaskChatTurn(step, args),
});
```

Lift the `args` object into `const agentTaskChatTurnArgs = { … }` and derive
`type AgentTaskChatTurnArgs = ObjectType<typeof agentTaskChatTurnArgs>`
(`ObjectType` from `convex/values`). `WorkflowCtx` comes from
`@convex-dev/workflow` (see `_sandbox_runtime/resumeSandboxSteps.ts:1`). Do
the same for `runProjectChatTurn` / `projectChatTurnArgs`.

Then update `workflowBody()` in `tests/turnLifecycleContract.test.ts`
(around line 136) so it slices from `export async function run…ChatTurn(` to
the following `export const ` instead of from `workflow.define(`. Pass the
function name per file (add it to the `chatWorkflowSteps` keys or a second
map). Do **not** change the expected journal arrays.

**Verify**: typecheck exit 0; chat test set (without the two new files) all
pass; `git diff` of the two modules shows only the move (no edited lines
inside the body).

#### 2b. Journal recorder test — `tests/sandboxChatJournal.test.ts`

Model the fake step on `tests/prepareSandboxHalfPreparedCleanup.test.ts:22-80`
(a typed `WorkflowCtx` object literal; `getFunctionName(ref)` from
`convex/server`; `zod` to parse args — no `as`). The fake:

- records every call as `{ kind: "query" | "mutation" | "action" | "event", name, args }`
  (`name` = `getFunctionName(ref)`; for `awaitEvent`, the event name);
- returns scripted results by function name from a per-scenario map; returns
  `null` for unknown mutations; throws for unknown queries/actions so a new
  call is noticed;
- for `awaitEvent`, returns a scripted completion payload. Build it from the
  event's validator (`workflowCompleteValidator`, imported where
  `agentTaskChatCompleteEvent` is defined, line 328–331).

Scenarios, run for **each** surface (`runAgentTaskChatTurn`,
`runProjectChatTurn`) with fixed ids from a convex-test fixture (or
`toWorkflowId` / plain id strings as the precedent does):

1. Sandbox `"active"`, daemon model (`usesChatDaemon` true — any `claude:*`
   model id from `_validators/aiModels.ts`), healthy, completion success.
2. Sandbox `"active"`, one-shot model (`usesChatDaemon` false) if
   `aiModels.ts` has one; otherwise skip this scenario and say so in a
   comment.
3. `getChatData` returns no `sandboxId` and status `"closed"`.
4. Sandbox `"active"`, `validateSandbox` returns `{ healthy: false }`.
5. Task only: status `"closed"`, `startTaskPreviewSandbox` throws.

Each scenario asserts `expect(calls).toMatchSnapshot()`. Use
`vi.useFakeTimers()` + `vi.setSystemTime(...)` if any recorded arg contains a
timestamp. Write the snapshots by running locally with CI unset:

`env -u CI pnpm --filter @eva/backend test -- tests/sandboxChatJournal.test.ts`

then commit `tests/__snapshots__/sandboxChatJournal.test.ts.snap`. From now
on, the snapshot file must not change in Steps 3–10:
`git diff --exit-code packages/backend/tests/__snapshots__/sandboxChatJournal.test.ts.snap`.

If you cannot make the fake deterministic for a scenario within a few
attempts, keep the scenarios that work, list the rest in the test file as
`test.todo`, and continue; if **scenario 1 or 3** cannot be recorded, STOP —
Step 10 then has no guard.

#### 2c. Behaviour parity test — `tests/sandboxChatParity.test.ts`

A convex-test file with `describe.each` over the two surfaces (fixtures in
the style of `tests/chatCompletionFenceArgs.test.ts` and
`tests/prClosedProjectScope.test.ts`). One `describe` per family, testing the
public or internal function by its **current path**:

- Daemon: `claimPendingTurn` claims a staged `pendingTurn` for the owner and
  rejects a stranger; `openSyntheticTurn` / `completeSyntheticTurn` set and
  clear `syntheticTurnMessageId`; project only: `lastSandboxActivity` is
  bumped (D6).
- Send / queue: `addMessage` inserts the user message and stages/starts the
  turn; `enqueueMessage` inserts a `queuedMessages` row when busy; task only:
  `sentViaOrchestrator` is stored on the queued row (D3).
- Busy rule (D5): with `activeWorkflowId` set on a task, `startExecute`
  queues instead of starting; the same on a project starts.
- Cancel: `cancelExecution` clears `activeChatWorkflowId` and `pendingTurn`;
  project only: `cancelProjectChatExecution(ctx, project, { drainQueue: false })`
  leaves a queued message in place (D12).
- Result: `saveResult` with success finalises the assistant message and
  clears `activeChatWorkflowId`; with `success: false` it records the error;
  project only: `lastSandboxActivity` set (D6).
- Prewarm (D7): `getChatPrewarmData` for a non-owner caller — assert the
  `userId` each surface returns today (task: the caller; project: the owner).
- Staging guard (D4): with a daemon model and `reviewTaskSandboxStatus:
  "closed"`, task `startExecute` does **not** stage a `pendingTurn`; a
  project with `reviewProjectSandboxStatus: "closed"` and a `sandboxId`
  **does**.

Name drift tests with the drift id, e.g.
`test("D7: prewarm uses the caller for tasks and the owner for projects", …)`.
These pin today's behaviour, including the unexplained parts.

**Verify**: `pnpm --filter @eva/backend test -- tests/sandboxChatJournal.test.ts tests/sandboxChatParity.test.ts`
→ all pass on the unrefactored code; the chat test set passes. Commit.

### Step 3: Add the sandbox chat surface adapter (no callers yet)

Create `convex/_chat/sandboxChatSurface.ts`. It composes the existing
adapters from `surfaceAdapters.ts` instead of growing `ChatSurfaceAdapter`
(the session adapter would have to implement fields it never uses). Shape
(add a field only when a family step needs it, and only for an entity
difference or a drift row):

```ts
export type SandboxChatId = Id<"agentTasks"> | Id<"projects">;

export type SandboxChatSurface<TId extends SandboxChatId, TEntity> = {
  /** The existing per-surface adapter: stream ids, release, drain, interrupt. */
  chat: ChatSurfaceAdapter<TId, TEntity>;
  /** "Task" | "Project": user-facing error text ("Task sandbox did not …"). */
  noun: "Task" | "Project";
  getEntity: (db: DatabaseReader, id: TId) => Promise<TEntity | null>;
  ownerUserId: (entity: TEntity) => Id<"users">;           // D9
  repoId: (entity: TEntity) => Id<"githubRepos"> | undefined; // D9
  activeChatWorkflowId: (entity: TEntity) => string | undefined;
  /** D5: a non-chat workflow that also makes the chat busy. */
  mainRunBusy: (entity: TEntity) => boolean;
  /** D4: may a daemon-pull turn be staged now. */
  canStageDaemonTurn: (entity: TEntity) => boolean;
  /** D8: kill via the entity daemon (true) or the sandbox process (false). */
  killEntityDaemonOnCancel: (entity: TEntity) => boolean;
  /** D6: extra fields patched when the sandbox shows activity. */
  activityPatch: () => { lastSandboxActivity?: number };
  /** D7. */
  prewarmUserId: (entity: TEntity, callerId: Id<"users">) => Id<"users">;
  /** Daemon wiring, from daemonPaths.ts; unchanged strings. */
  daemonMutations: DaemonMutationEnv;
  completionMutation: string;
  /** Per-surface patches on the entity's own table, closure-shaped. */
  patchEntity: (ctx: MutationCtx, id: TId, patch: SandboxChatEntityPatch) => Promise<void>;
  /** Workflow steps, closure-shaped so the journal names and arg key order stay exact. */
  steps: SandboxChatSteps<TId>;
};
```

`SandboxChatEntityPatch` lists only fields both tables share
(`activeChatWorkflowId`, `pendingTurn`, `syntheticTurnMessageId`,
`cancelRequestedAt`, `lastChatModel`, `providerAccountId`, composer traits,
`updatedAt`); check each in `_validators/tableFields.ts` for both
`agentTaskFields` and `projectFields`. If a patch needs a field only one
table has, it belongs in a surface-specific closure, not in this type.

Each `steps` entry is a closure that calls the **existing** internal
reference with the **existing** arg key order, e.g. for tasks:

```ts
saveResult: (step, id, result) =>
  step.runMutation(internal.agentTaskChatWorkflow.saveResult, {
    taskId: id,
    ...result, // built by shared code as { turnId, success, result, error, activityLog, … }
  }),
```

Export `taskSandboxChat` and `projectSandboxChat` instances. Typing: no
`as`, no `unknown`. If the generic `TId`/`TEntity` pair cannot be expressed
without a cast, use a visitor like `ChatAdapterVisitor`
(`surfaceAdapters.ts:407-411`) and STOP if that also fails.

**Verify**: typecheck exit 0; `tests/convexModuleCycleContract.test.ts`
passes; chat test set passes. Commit.

### Steps 4–9: Move one function family per step

For each family below, in this order:

1. Write the shared body in the named shared file, taking
   `(ctx, surface, id, args)` and calling only adapter fields for anything
   that differs.
2. Replace both modules' bodies with thin wrappers that keep the export name,
   the `authMutation` / `internalMutation` / `internalQuery` / `authAction`
   kind, the `args` validator (same key names: `taskId` / `projectId`), and
   the `returns` validator. Shared arg fields go in an exported validator
   object in the shared file and are spread into both wrappers. Pattern:

   ```ts
   export const saveResult = internalMutation({
     args: { taskId: v.id("agentTasks"), ...sandboxChatSaveResultArgs },
     returns: v.null(),
     handler: (ctx, { taskId, ...result }) =>
       saveSandboxChatResult(ctx, taskSandboxChat, taskId, result),
   });
   ```

3. Exported plain functions used elsewhere keep their name and signature as
   one-line wrappers (`cancelTaskChatExecution`, `cancelProjectChatExecution`
   with its `options` parameter from plan 013, `sendTaskChatMessage`,
   `sendProjectChatMessage`).
4. Repoint any source-contract test that now fails only because the code it
   greps moved (for example `tests/codeStructureServicesContract.test.ts:524-640`
   lists both module paths): add the shared file to the list, or point the
   assertion at it. Keep the asserted strings identical. Never delete an
   assertion; if one can no longer hold, STOP.
5. Verify, then commit.

| Step | Family | Shared file | Functions |
|---|---|---|---|
| 4 | Daemon | `_chat/sandboxChatDaemon.ts` | `claimPendingTurn`, `updateBackgroundAgents`, `updateGoal`, `requestStopBackgroundAgent`, `openSyntheticTurn`, `completeSyntheticTurn`, `ensurePendingTurn` (wrappers stay in `_chat/taskChatDaemon.ts` / `_chat/projectChatDaemon.ts`; the re-exports in the two workflow modules stay as they are) |
| 5 | Prewarm | `_chat/sandboxChatTurn.ts` | `prewarmChatDaemon`, `prewarmChatDaemonNow`, `getChatPrewarmData` (D7 via `prewarmUserId`) |
| 6 | Cancel | `_chat/sandboxChatTurn.ts` | `cancel…ChatExecution`, `cancelExecution` (D8, D12) |
| 7 | Send / queue | `_chat/sandboxChatTurn.ts` | `addMessage`, `enqueueMessage`, `send…ChatMessage`, `enqueue…ChatMessage` (D3: `sentViaOrchestrator` stays an arg on the task wrappers only; the shared body takes it as an optional field) |
| 8 | Turn start | `_chat/sandboxChatTurn.ts` | `stageAndStart…ChatTurn`, `startExecute`, `retryLastTurnWithAccount`, `retryEmptyStalledTurn` (D4, D5). Prompt builders stay per surface and are passed in as `surface.buildPrompt` or called by the per-surface `getChatData` |
| 9 | Result | `_chat/sandboxChatTurn.ts` | `addAssistantPlaceholder`, `saveResult`, `handleCompletion` (D6). `recordCompletionLog` gets `entityType: "task-chat" \| "project-chat"` and `projectId` from the adapter (`task.projectId` vs the project id) |

**Verify (every step)**:
- `pnpm --filter @eva/backend typecheck` → exit 0
- chat test set → all pass
- `git diff --exit-code packages/backend/tests/__snapshots__/sandboxChatJournal.test.ts.snap` → exit 0
- `grep -c "^export " packages/backend/convex/agentTaskChatWorkflow.ts packages/backend/convex/projectChatWorkflow.ts packages/backend/convex/_chat/taskChatDaemon.ts packages/backend/convex/_chat/projectChatDaemon.ts`
  → the same counts as before Step 4 (record them in Step 0)

### Step 10: Share the workflow runner

Create `_chat/sandboxChatWorkflow.ts` with
`runSandboxChatTurn(step: WorkflowCtx, surface, args)`. Port the body of
`runAgentTaskChatTurn` / `runProjectChatTurn` into it. Every step call goes
through `surface.steps.*`, so each surface records its own function names.
Rules:

- The task's sandbox-start block (`agentTaskChatWorkflow.ts:929-996`) becomes
  an optional adapter field `surface.ensureSandboxForTurn?: (step, args, data) => Promise<"ready" | "failed">`.
  The project surface leaves it **undefined** in this step (D1 unchanged).
- Failure saves go through one local `saveFailure` helper (D2). It must build
  args in the exact order `{ <id key>, turnId, success: false, result: null, error, activityLog: null }`.
- Keep comments that explain behaviour (for example the task's "Persist the
  assistant reply BEFORE publish" note at 1158–1162; it applies to both).
- `runAgentTaskChatTurn` and `runProjectChatTurn` become one-line calls to
  `runSandboxChatTurn` with their surface. `workflow.define` names, args and
  the `defineEvent` names stay where they are.
- Update `tests/turnLifecycleContract.test.ts`: the source-order journal
  arrays for the two chat workflows can no longer be read from source. Move
  them into a comment in `tests/sandboxChatJournal.test.ts` next to the
  snapshot tests, and remove only those two entries from
  `chatWorkflowSteps` (keep the session entry and the "persists a chat turn
  before its workflow starts" tests). The snapshot file is now the guard.

**Verify**:
- typecheck exit 0; chat test set all pass
- `git diff --exit-code packages/backend/tests/__snapshots__/sandboxChatJournal.test.ts.snap` → exit 0 (**the key gate**: same names, args and order)
- `wc -l packages/backend/convex/agentTaskChatWorkflow.ts packages/backend/convex/projectChatWorkflow.ts` → each well under half its starting size

Commit. Then run the full backend suite and `pnpm lint` → all pass.

### Step 11 (behaviour change — ask first): project chat starts its own sandbox

**STOP before this step and ask the operator**, quoting D1. It changes what
users see (a project chat message starts a closed or missing sandbox instead
of failing) and it changes the project workflow journal for turns that start
a sandbox. Ask also: "Are there project chat turns in flight on prod right
now?" (the operator can check projects with `activeChatWorkflowId` set). A
turn that is in flight when this deploys and took the old thaw path will fail
replay with "Journal entry mismatch"; deploying when none are in flight
avoids that.

Only with explicit approval:

1. In `_projects/sandbox.ts`, add `markProjectSandboxStartingForChat`
   (mirror `markTaskSandboxStartingForChat`, `agentTaskChatWorkflow.ts:1225-1255`,
   using `reviewProjectSandboxStatus`, `canRequestSandboxStart`,
   `nextSandboxStartAttempt`, `seedSandboxStartupActivity(ctx.db, \`project-sandbox-startup-${projectId}\`)`)
   and `waitForProjectPreviewSandboxActive` (mirror
   `_agentTasks/sandbox.ts:766`). Read both originals fully first.
2. Project `getChatData` returns `baseBranch` the way the project build
   starts its sandbox (find how `startProjectPreviewSandbox`,
   `_sandbox_runtime/sessions.ts:2429`, is called today and reuse that base
   branch source; if there is none, STOP).
3. Give `projectSandboxChat` an `ensureSandboxForTurn` that calls them and
   `internal.sandbox.startProjectPreviewSandbox` with the project's branch
   name (not `eva/task-…`).
4. Add parity tests: D1 for projects now matches tasks (closed project →
   start path). Update the project snapshots deliberately:
   `env -u CI pnpm --filter @eva/backend test -- tests/sandboxChatJournal.test.ts -u`,
   and check in the diff that **only** project scenario 3 changed.

**Verify**: typecheck; chat test set; full suite; lint — all pass. Commit
separately with a `feat(projects): …` message.

### Step 12: Changelog

Add at the top of `internal/changelog/2026-11.md` (current month's file):

```markdown
## Task and project chat share one backend implementation - <YYYY-MM-DD>

- `agentTaskChatWorkflow.ts` and `projectChatWorkflow.ts` were ~85 % identical copies and had drifted. Shared bodies now live in `_chat/sandboxChatDaemon.ts`, `_chat/sandboxChatTurn.ts` and `_chat/sandboxChatWorkflow.ts`, driven by `_chat/sandboxChatSurface.ts`. Every export and function path is unchanged (web app, daemon string paths, workflow journals).
- Real differences are adapter fields: main-run busy rule, owner, `lastSandboxActivity`, `sentViaOrchestrator`, cancel kill target.
- `tests/sandboxChatJournal.test.ts` snapshots each workflow's step journal; `tests/sandboxChatParity.test.ts` pins per-surface behaviour.
- (If Step 11 shipped) Project chat now starts a closed or missing sandbox, as task chat does.
- Supersedes "duplicate, do not abstract" in `chat-in-sandbox-for-projects-and-tasks.md`.
```

**Verify**: `pnpm lint` → exit 0. Commit.

## Test plan

- `tests/sandboxChatJournal.test.ts` (new): fake-`WorkflowCtx` recorder,
  scenarios 1–5 per surface, file snapshots. Written in Step 2 against the
  old code; unchanged through Step 10; changed only for project scenario 3 in
  Step 11. Pattern: `tests/prepareSandboxHalfPreparedCleanup.test.ts`.
- `tests/sandboxChatParity.test.ts` (new): convex-test, `describe.each` over
  both surfaces, one `describe` per family, drift tests named D3–D8/D12.
  Pattern: `tests/chatCompletionFenceArgs.test.ts`,
  `tests/prClosedProjectScope.test.ts`.
- Existing source-contract tests in the chat test set: repointed, never
  weakened.
- Final: full backend suite and lint.

## Done criteria

- [ ] `chat-in-sandbox-for-projects-and-tasks.md` starts with the superseded line
- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `pnpm --filter @eva/backend test` exits 0 (full suite)
- [ ] `pnpm lint` exits 0
- [ ] `tests/sandboxChatJournal.test.ts` and `tests/sandboxChatParity.test.ts` exist and pass
- [ ] The snapshot file is unchanged between the Step 2 commit and the Step 10 commit (`git diff --exit-code <step2-sha> <step10-sha> -- packages/backend/tests/__snapshots__/sandboxChatJournal.test.ts.snap`)
- [ ] Export counts of the four wrapper files equal the Step 0 counts
- [ ] `grep -rn "agentTaskChatWorkflow\|projectChatWorkflow\|taskChatDaemon\|projectChatDaemon" packages/backend/convex/_chat/sandboxChat*.ts` → no import lines (only `internal.*` references)
- [ ] `git diff 2042a0ac7 -- packages/backend/convex/_sandbox_runtime/daemonPaths.ts` → empty
- [ ] No `as`, `any`, `unknown` or non-null `!` added: run `git diff <step0-sha> -- packages/backend/convex | grep -nE "^\+.*(\bas [A-Z{(]|: any\b|: unknown\b|<unknown>|[A-Za-z0-9_)\]]!\.)"`; every match must be inside a comment or string (moved comments may say "unknown"), none in code
- [ ] Changelog entry added; `plans/README.md` status row updated (if the file exists)

## STOP conditions

Stop and report back (do not improvise) if:

- Any of plans 001, 010, 011, 012, 013 is not DONE, or the full backend suite
  is not green in Step 0.
- A function listed in "Current state" no longer exists, or a drift row has
  been reversed by another change.
- The journal snapshot changes in Steps 3–10. Never update it with `-u`
  outside Step 11.
- A source-contract assertion can only pass if you delete or weaken it.
- Typing the adapter needs `as`, `unknown`, `any` or `!`.
- `tests/convexModuleCycleContract.test.ts` fails.
- A step would rename or remove an exported function, change an `args` key
  (`taskId` / `projectId`), or change a `daemonPaths.ts` string.
- You reach Step 11 — always stop and ask first.
- A family's two copies differ in a way not in the drift table (after the
  Step 0 refresh). Add it to the table in your report and ask whether it is
  real or drift before encoding it.

## Maintenance notes

- New chat behaviour goes in the shared modules once. Adapter fields are only
  for real entity differences. Each new field should name the drift row or
  entity fact it encodes in its doc comment.
- Unexplained drift reported, not fixed (decide later, one small plan each):
  - D4: task chat refuses to stage a daemon-pull turn while its sandbox is
    `"closed"`/`"stopping"`; project chat stages it anyway.
  - D7: task prewarm stamps the caller as `userId`; project prewarm stamps
    the owner. One of them is likely wrong for collaborator prewarms.
  - D11: `surfaceAdapters.ts` `interrupt` checks `provider === "claude"`,
    while the cancel path checks `usesChatDaemon(...)` (claude, codex,
    cursor). A stalled codex/cursor turn is interrupted differently from a
    cancelled one.
- Session chat (`sessionWorkflow.ts`) is a third copy of much of this logic.
  Once this lands, a follow-up can add a session surface; that is the "3+
  parent types" the old design doc named as the trigger.
- If Step 11 was skipped, project chat still fails with "No active sandbox"
  whenever `sandboxId` is unset — including right after a merged PR
  (plan 013 clears `sandboxId`).
- Reviewer: read the snapshot diff first (it should be empty until Step 11),
  then check each wrapper keeps its kind, args and returns validators.
