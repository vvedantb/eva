# Plan 009: Every sandbox completion callback checks that the caller can access the entity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. If `plans/README.md` does not exist, do not create it;
> report your status in your final reply instead.
>
> **Drift check (run first)**:
> `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/docInterviewWorkflow.ts packages/backend/convex/evaluationWorkflow.ts packages/backend/convex/prRecapWorkflow.ts packages/backend/convex/projectInterviewWorkflow.ts packages/backend/convex/testGenWorkflow.ts packages/backend/convex/_automations/runs.ts packages/backend/convex/_taskWorkflow/publicMutations.ts packages/backend/tests/repoAccessGuards.test.ts packages/backend/tests/backendAuthorizationContract.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

Sandboxes report a finished agent run by calling a public `authMutation`
named `handle*Completion`. `authMutation` only proves that the caller is
signed in. Ten of these handlers take an entity id from the caller and
then forward the caller-supplied `result` / `activityLog` into that entity's
workflow, without checking that the caller can access the entity's repo. The
lease fence (`turnId` + `leaseGeneration`) already drops most forged calls,
but it is not an access control: a turn id is a plain Convex id. The three
chat surfaces already check repo access in the same handler; this plan gives
the one-shot handlers the same check, so a signed-in user of another team
cannot write results into a doc, project, evaluation, automation run or task
run they cannot see.

## Current state

### Who calls these handlers

The sandbox callback authenticates with a sandbox JWT whose subject is the
**launching user's** Clerk id (`packages/backend/convex/sandboxJwt.ts:67`:
`new SignJWT({ sub: clerkId })`). Every launcher below passed an access check
for that same user when it started the workflow, so a correct callback always
passes the new check.

| Launcher | Launching user | Check at launch |
|---|---|---|
| `docInterviewWorkflow.startInterview` / `startGenerate` (`docInterviewWorkflow.ts:335`, `:570`) | `ctx.userId` | `getDocWithAccess` (`:345`, `:580`) |
| `testGenWorkflow.startTestGen` (`testGenWorkflow.ts:418`) | `ctx.userId` | `getDocWithAccess` (`:424`) |
| `docs.ts` → `internal.docs.startPrRecap` (`docs.ts:964`, `:1036`) | `ctx.userId` | `hasCodebaseRepoAccess` (`_prRecapWorkflow/start.ts:34`) — the doc may live on a sibling repo |
| `projectInterviewWorkflow.startInterview` / `startSpec` (`:447`, `:490`) | `ctx.userId` | `getProjectWithAccess` |
| `evaluationWorkflow.startEvaluation` / `startFix` (`:670`, `:738`) | `ctx.userId` | `hasRepoAccess` (`:682`, `:744`) |
| `_automations/triggers.ts:50-90` `startAutomationRun` | `automation.createdBy` (`:85`) | automation creation path |
| task runs (`taskWorkflow`) | task launcher | task access |

### The access helpers to use (commit `2643e0857` "centralise team/repo/doc/session access checks (#1112)")

- `packages/backend/convex/functions.ts:41` — `hasRepoAccess(db, repoId, userId): Promise<boolean>`
- `packages/backend/convex/functions.ts:136` — `hasTaskAccess(db, task, userId): Promise<boolean>` (repo, or the project's repo)
- `packages/backend/convex/_docs/access.ts:10-19`:

```ts
/**
 * Read/comment rule: PR recaps follow the codebase rule (any sibling repo);
 * other docs need their own repo.
 */
export async function canAccessDoc(
  db: GenericDatabaseReader<DataModel>,
  doc: Pick<Doc<"docs">, "repoId" | "kind">,
  userId: Id<"users">,
): Promise<boolean> {
  if (doc.kind === "pr-recap") {
    return hasCodebaseRepoAccess(db, doc.repoId, userId);
  }
  return hasRepoAccess(db, doc.repoId, userId);
}
```

Use `canAccessDoc` for all four doc handlers. For non-recap docs it equals
`hasRepoAccess(doc.repoId)` (what the launchers enforced). For PR recaps it
allows the sibling-repo rule the recap launcher uses.

### The exemplar to match (already correct)

`packages/backend/convex/agentTaskChatWorkflow.ts:1411-1418`:

```ts
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || !task.activeChatWorkflowId) return null;
    if (!task.repoId) return null;
    if (!(await hasRepoAccess(ctx.db, task.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
```

Same pattern in `_sessions/workflow.ts:1656-1657` and
`projectChatWorkflow.ts:1258`. The check runs **after** the "nothing to do"
early return and **before** any fence/turn/write call.

### The vulnerable sites (all verified by reading the live file)

Every one has the same shape. Example, `packages/backend/convex/docInterviewWorkflow.ts:281-306`:

```ts
export const handleCompletion = authMutation({
  args: {
    docId: v.id("docs"),
    ...
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || !doc.activeWorkflowId) return null;
    if (
      !(await settleAgentTurnCompletion(ctx, {
        entityId: args.docId,
        ...
```

| # | File:line of `export const` | Export | Entity line to insert after | Check to add |
|---|---|---|---|---|
| 1 | `docInterviewWorkflow.ts:281` | `handleCompletion` | `if (!doc \|\| !doc.activeWorkflowId) return null;` (`:295`) | `canAccessDoc(ctx.db, doc, ctx.userId)` |
| 2 | `docInterviewWorkflow.ts:459` | `handleGenerateCompletion` (not in the original lead; same bug) | `:473` | `canAccessDoc(ctx.db, doc, ctx.userId)` |
| 3 | `testGenWorkflow.ts:343` | `handleCompletion` | `if (!doc \|\| !doc.activeWorkflowId) return null;` (`:357`) | `canAccessDoc(ctx.db, doc, ctx.userId)` |
| 4 | `prRecapWorkflow.ts:256` | `handleCompletion` | `if (!doc \|\| !doc.activeWorkflowId) return null;` (`:270`) | `canAccessDoc(ctx.db, doc, ctx.userId)` |
| 5 | `projectInterviewWorkflow.ts:391` | `handleCompletion` | `if (!project \|\| !project.activeWorkflowId) return null;` | `hasRepoAccess(ctx.db, project.repoId, ctx.userId)` |
| 6 | `projectInterviewWorkflow.ts:624` | `handleSpecCompletion` | same | `hasRepoAccess(ctx.db, project.repoId, ctx.userId)` |
| 7 | `evaluationWorkflow.ts:465` | `handleCompletion` | `if (!report \|\| !report.activeWorkflowId) return null;` | `hasRepoAccess(ctx.db, report.repoId, ctx.userId)` |
| 8 | `evaluationWorkflow.ts:619` | `handleFixCompletion` | same | `hasRepoAccess(ctx.db, report.repoId, ctx.userId)` |
| 9 | `_automations/runs.ts:315` | `handleCompletion` | `if (!run \|\| !run.activeWorkflowId) return null;` | `hasRepoAccess(ctx.db, run.repoId, ctx.userId)` |
| 10 | `_taskWorkflow/publicMutations.ts:57` | `handleCompletion` | the `if (!task) { return ignoreStaleCompletionCallback(...) }` block (`:72-76`) | `hasTaskAccess(ctx.db, task, ctx.userId)` |

(`run.repoId` is the automation's repo: `_automations/triggers.ts:59-61`
inserts `repoId: automation.repoId`. `evaluationReports.repoId` is required:
`_validators/tableFields.ts:1829`.)

Imports already present: `evaluationWorkflow.ts:10` has `hasRepoAccess`;
`_automations/runs.ts:22` has `hasRepoAccess`; `_taskWorkflow/publicMutations.ts:5`
has `hasTaskAccess`. Imports to add: `canAccessDoc` from `./_docs/access` in
`docInterviewWorkflow.ts` (line 10 already imports `getDocWithAccess` from it),
`testGenWorkflow.ts` (line 13, same) and `prRecapWorkflow.ts` (new import);
`hasRepoAccess` from `./functions` in `projectInterviewWorkflow.ts` (line 9
already imports `authMutation, getProjectWithAccess` from it).

**Already safe, do not change**: `summarizeWorkflow.ts:180` (checks
`session.userId !== ctx.userId`, line 207), and the three chat
`handleCompletion`s above.

### Conventions (quoted)

From `CLAUDE.md`:
- "No `any`, `unknown`, `as`, or non-null `!`. No `isRecord(object: unknown)` — parse at the boundary (Zod). Hard types → rethink design."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary."
- "Eliminate duplication, centralise your changes so its easier to update them" — reuse the helpers above; do not write a new access function.
- "Do not run dev / lint / build unless the user asks." — the commands below are the ones the operator approved for this plan.

From `docs/eva-convex.md`:
- "Never manually define interfaces for Convex documents. Always import: `Doc<\"tableName\">`, `Id<\"fieldName\">`."
- Do NOT use its `npx convex codegen` typecheck line — this plan forbids codegen (see Commands).

Durable-workflow rule: these handlers are referenced by string from the
sandbox (`"docInterviewWorkflow:handleCompletion"` etc.) and by in-flight
workflow journals. Do NOT rename, move or remove any export. Do not change
their `args`.

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm --filter @eva/backend typecheck` | exit 0, no errors |
| Targeted tests | `pnpm --filter @eva/backend test -- tests/repoAccessGuards.test.ts tests/backendAuthorizationContract.test.ts tests/agentTurnContract.test.ts tests/convexModuleCycleContract.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

NEVER run `npx convex codegen`, `convex dev` or `convex deploy`. Five backend
tests already fail at planning time (`pendingQuestion`,
`sessionStopRecoveryContract` x3, `providerAccountHandoffContract`); they are
not yours. Run only the targeted files above.

## Suggested executor toolkit

- `convex-rules` skill, if available, for Convex mutation conventions.
- Read `packages/backend/tests/repoAccessGuards.test.ts` in full before Step 3; it is the test pattern.

## Scope

**In scope** (the only files you should modify):
- `packages/backend/convex/docInterviewWorkflow.ts`
- `packages/backend/convex/testGenWorkflow.ts`
- `packages/backend/convex/prRecapWorkflow.ts`
- `packages/backend/convex/projectInterviewWorkflow.ts`
- `packages/backend/convex/evaluationWorkflow.ts`
- `packages/backend/convex/_automations/runs.ts`
- `packages/backend/convex/_taskWorkflow/publicMutations.ts`
- `packages/backend/tests/repoAccessGuards.test.ts`
- `packages/backend/tests/backendAuthorizationContract.test.ts`
- `internal/changelog/2026-11.md` (one entry)

**Out of scope**:
- `summarizeWorkflow.ts` — already checks ownership; reordering it is cosmetic.
- The three chat `handleCompletion`s — already checked.
- `functions.ts`, `_docs/access.ts` — reuse, do not edit.
- Any other public mutation (start/cancel handlers already check).
- `callback-src/**` and the sandbox JWT — the caller side is correct.

## Git workflow

- Stay on the current branch. Do NOT create a branch, push or open a PR unless the operator says so.
- Conventional commits, matching `git log` (e.g. `refactor(backend): centralise team/repo/doc/session access checks (from #930) (#1112)`). Suggested: `fix(backend): check repo access in sandbox completion callbacks`.

## Steps

### Step 1: Add the check to the ten handlers

For each row of the table, insert directly after the named early-return line:

```ts
    if (!(await canAccessDoc(ctx.db, doc, ctx.userId))) {
      throw new Error("Not authorized");
    }
```

(swap in the helper and arguments from the table). For row 10 the insert goes
after the `if (!task) { ... }` block and before `if (!args.runId)`. The check
must come before `settleAgentTurnCompletion(` / `resolveCompletionTurn(` /
`sendCompletionEvent(` in every handler. Add the imports listed in "Current
state". Use the exact message `"Not authorized"` (the tests assert it).

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.
**Verify**: `grep -c "Not authorized" packages/backend/convex/docInterviewWorkflow.ts` → `2` (it was `0` at planning time).

### Step 2: Add a source contract so a new completion handler cannot skip the check

In `packages/backend/tests/backendAuthorizationContract.test.ts`, inside the
existing `describe("backend authorization boundaries", ...)`, add a test that
iterates these `[path, exportName]` pairs:

```ts
const completionCallbacks: ReadonlyArray<[string, string]> = [
  ["docInterviewWorkflow.ts", "handleCompletion"],
  ["docInterviewWorkflow.ts", "handleGenerateCompletion"],
  ["testGenWorkflow.ts", "handleCompletion"],
  ["prRecapWorkflow.ts", "handleCompletion"],
  ["projectInterviewWorkflow.ts", "handleCompletion"],
  ["projectInterviewWorkflow.ts", "handleSpecCompletion"],
  ["evaluationWorkflow.ts", "handleCompletion"],
  ["evaluationWorkflow.ts", "handleFixCompletion"],
  ["_automations/runs.ts", "handleCompletion"],
  ["_taskWorkflow/publicMutations.ts", "handleCompletion"],
  ["summarizeWorkflow.ts", "handleCompletion"],
  ["agentTaskChatWorkflow.ts", "handleCompletion"],
  ["projectChatWorkflow.ts", "handleCompletion"],
  ["_sessions/workflow.ts", "handleCompletion"],
];
```

For each: slice the body from `export const ${name} = authMutation(` to the
next `"\n});"` (same slicing as `tests/agentTurnContract.test.ts:131-133`).
Find `guardAt` = smallest index ≥ 0 of any of these needles:
`canAccessDoc(`, `hasRepoAccess(`, `hasTaskAccess(`,
`session.userId !== ctx.userId` (the last one is summarize's existing guard).
Assert a guard was found. For every
handler except `summarizeWorkflow.ts`, also find `firstUseAt` = smallest index
≥ 0 of `settleAgentTurnCompletion(`, `resolveCompletionTurn(`,
`sendCompletionEvent(` and assert `guardAt < firstUseAt`. Use the existing
`convexSource(path)` helper at the top of the file. Keep the code free of
`as`, `!`, `any`, `unknown`.

**Verify**: `pnpm --filter @eva/backend test -- tests/backendAuthorizationContract.test.ts` → all pass.
**Verify (red check)**: temporarily delete the new check from `testGenWorkflow.ts`, rerun → the new test fails naming `testGenWorkflow.ts handleCompletion`; restore it.

### Step 3: Add behaviour tests with convex-test

In `packages/backend/tests/repoAccessGuards.test.ts`, add a new
`describe("sandbox completion callbacks refuse callers without repo access", ...)`
that reuses the existing `fixture()` (owner, stranger, `docId`, `projectId`,
`taskId`). Add three tests, each wrapped with `TIMEOUT_MS` like the existing ones:

1. **doc interview**: `f.t.run` patch `f.docId` with `activeWorkflowId: "wf-doc"`. Then
   - `f.stranger.mutation(api.docInterviewWorkflow.handleCompletion, { docId: f.docId, success: true, result: "pwned", error: null, activityLog: null })` → `rejects.toThrow("Not authorized")`.
   - The same call as `f.owner` → resolves to `null` (no lease fence is sent, so `settleAgentTurnCompletion` returns false and the handler returns early; this proves the owner passes the check).
2. **project interview**: patch `f.projectId` with `activeWorkflowId: "wf-project"`, then the same two calls against `api.projectInterviewWorkflow.handleCompletion` with `projectId: f.projectId`.
3. **task run**: `f.stranger.mutation(api.taskWorkflow.handleCompletion, { taskId: f.taskId, success: true, result: null, error: null, activityLog: null })` → rejects `"Not authorized"`; the same call as `f.owner` → resolves `null` (no `runId`, so it is ignored as stale).

The ordering matters: because the stranger sends no fence, the stranger call
only throws if the check runs before the fence. Do not add a fence to the
stranger calls.

**Verify**: `pnpm --filter @eva/backend test -- tests/repoAccessGuards.test.ts` → all pass, including 3 new tests.

### Step 4: Run the related contracts and the changelog entry

Add one entry at the top of `internal/changelog/2026-11.md`, directly under
`# Changelog — November 2026`, in the file's format
(`## <Title> - 2026-MM-DD` + bullets): what changed (ten completion callbacks
now check repo/doc/task access before the lease fence) and why (`authMutation`
only authenticates).

**Verify**: `pnpm --filter @eva/backend test -- tests/repoAccessGuards.test.ts tests/backendAuthorizationContract.test.ts tests/agentTurnContract.test.ts tests/convexModuleCycleContract.test.ts` → all pass.
**Verify**: `pnpm lint` → exit 0.

## Test plan

- `tests/repoAccessGuards.test.ts`: 3 new convex-test cases (doc interview, project interview, task run): stranger rejected with `"Not authorized"`, owner accepted (`null`).
- `tests/backendAuthorizationContract.test.ts`: 1 new contract over 14 handlers: guard exists and runs before the fence.
- Pattern: `tests/repoAccessGuards.test.ts` (fixture, `withIdentity`, `workflow.register(t)`, fake timers).
- Unchanged and must still pass: `tests/agentTurnContract.test.ts` ("every one-shot completion settles its lease fence first").

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] The four targeted test files pass; 3 new convex tests and 1 new contract test exist
- [ ] `grep -n "Not authorized" packages/backend/convex/{docInterviewWorkflow,testGenWorkflow,prRecapWorkflow,projectInterviewWorkflow,evaluationWorkflow}.ts packages/backend/convex/_automations/runs.ts packages/backend/convex/_taskWorkflow/publicMutations.ts` shows a line inside each of the 10 handlers
- [ ] `git diff --stat` lists only in-scope files
- [ ] No export renamed or removed: `git diff 2042a0ac7 -- packages/backend/convex | grep "^-export const"` returns nothing
- [ ] Changelog entry added; `plans/README.md` row updated if the file exists

## STOP conditions

Stop and report (do not improvise) if:

- A handler in the table no longer has the early-return line quoted, or already has an access check.
- A test shows the owner call throwing `"Not authorized"`: the launching user may differ from the entity's repo members (for example an automation whose `createdBy` left the team). Report the site; do not loosen the check.
- `convexModuleCycleContract.test.ts` fails after adding an import (a new import cycle).
- Typecheck needs `as`, `!`, `any` or `unknown` to compile.
- You find another `authMutation` completion handler not in this plan — list it in your report; do not fix it here.

## Maintenance notes

- A callback whose launching user loses repo access mid-run now throws; the turn then ends through the lease reconciler (`turns.ts`) instead of saving a result. That matches the chat surfaces.
- Any new `handle*Completion = authMutation` must be added to the Step 2 contract list.
- Reviewer focus: the check is before the fence in every handler, and PR recaps use `canAccessDoc` (sibling-repo rule), not `getDocWithAccess`.
- Deferred: `summarizeWorkflow.ts` checks ownership after `settleAgentTurnCompletion`. A throw rolls the whole mutation back, so this is safe; moving it first is cosmetic.
