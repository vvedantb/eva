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
> `git diff --stat 478be7912..HEAD -- packages/backend/convex/prRecapWorkflow.ts packages/backend/convex/_automations/runs.ts packages/backend/convex/_taskWorkflow/publicMutations.ts packages/backend/tests/repoAccessGuards.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `478be7912`, 2026-11-12
- Refreshed: 2026-11-12 (was planned at 2042a0ac7)

## Why this matters

Sandboxes report a finished agent run by calling a public `authMutation`
named `handleCompletion`. `authMutation` only proves that the caller is
signed in. Three of these handlers take an entity id from the caller and
forward the caller-supplied `result` / `activityLog` into that entity's
workflow without checking that the caller can access the entity's repo. The
lease fence (`turnId` + `leaseGeneration`) drops most forged calls, but it is
not access control: a turn id is a plain Convex id. Since the original plan,
the doc interview, test-gen, evaluation (both handlers) and project interview
handlers gained a check. This plan gives the remaining three the same check,
so a signed-in user of another team cannot write results into a PR recap,
automation run or task run they cannot see.

## Current state

### Who calls these handlers

The sandbox callback authenticates with a sandbox JWT whose subject is the
**launching user's** Clerk id (`packages/backend/convex/sandboxJwt.ts:38`:
`{ sub: clerkId }`). Each launcher checked that same user, so a correct
callback passes the new check.

| Handler | Launching user | Check at launch |
|---|---|---|
| `prRecapWorkflow.handleCompletion` | `ctx.userId` passed by `docs.ts:965` and `docs.ts:1037` into `internal.docs.startPrRecap` (`docs.ts:824`) | `hasCodebaseRepoAccess` (`docs.ts:~927`, `_prRecapWorkflow/start.ts:34`) — the recap doc may live on a sibling repo |
| `_automations/runs.ts` `handleCompletion` | `automation.createdBy` (`_automations/triggers.ts:88`) | automation creation path; `run.repoId = automation.repoId` (`triggers.ts:61`, `:79`) |
| `_taskWorkflow/publicMutations.ts` `handleCompletion` | `userId` given to `startTaskRun` (`_taskWorkflow/startRun.ts:41`); e.g. `task.createdBy` in `scheduling.ts:152`; passed on as `userId` to `launchOnExistingSandbox` (`workflowDefinition.ts:195`) | each `startTaskRun` caller (`_agentTasks/execution.ts:95`, `_automations/findings.ts:142`, `_projects/conflicts.ts:65`, `buildWorkflow.ts:194`, `evaluationReports.ts:163`, `_taskWorkflow/scheduling.ts:149`) |

### The access helpers to use (reuse; do not write a new one)

- `packages/backend/convex/functions.ts:48` — `hasRepoAccess(db, repoId, userId): Promise<boolean>`
- `packages/backend/convex/functions.ts:162-178` — `hasTaskAccess(db, task, userId)`: draft privacy (`status !== "draft" || createdBy === userId`), then the task's repo, else its project's repo.
- `packages/backend/convex/_docs/access.ts:10-19`:

```ts
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

Use `canAccessDoc` for the PR recap handler (sibling-repo rule, which the
recap launcher enforces). Do NOT use `getDocWithAccess` there: its comment
(`_docs/access.ts:32-35`) says it is stricter and gives PR recaps no
codebase-wide access.

### The exemplars to match (already correct)

`packages/backend/convex/testGenWorkflow.ts:352-355` (same in
`docInterviewWorkflow.ts:289-292`, `evaluationWorkflow.ts:474-477` and
`:625-628`):

```ts
    const doc = await ctx.db.get(args.docId);
    if (!doc || !doc.activeWorkflowId) return null;
    if (!(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId)))
      throw new Error("Not authorized");
    if (
      !(await settleAgentTurnCompletion(ctx, {
```

`_sessions/workflow.ts:1610` `handleCompletion` uses the same shape before
`resolveCompletionTurn`. The check runs **after** the "nothing to do" early
return and **before** any fence/turn/write call.

### The three sites still missing the check (verified at `478be7912`)

1. `packages/backend/convex/prRecapWorkflow.ts:256-297` (`handleCompletion`):

```ts
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || !doc.activeWorkflowId) return null;
    if (
      !(await settleAgentTurnCompletion(ctx, {
        entityId: args.docId,
```

   Insert after line 265 (`if (!doc || !doc.activeWorkflowId) return null;`):
   `if (!(await canAccessDoc(ctx.db, doc, ctx.userId))) throw new Error("Not authorized");`.
   Imports: line 8 is `import { authMutation } from "./functions";`; there is
   no `./_docs/access` import yet — add `import { canAccessDoc } from "./_docs/access";`.

2. `packages/backend/convex/_automations/runs.ts:342-385` (`handleCompletion`):

```ts
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.automationRunId);
    if (!run || !run.activeWorkflowId) return null;
    if (
      !(await settleAgentTurnCompletion(ctx, {
        entityId: args.automationRunId,
```

   Insert after the `if (!run || !run.activeWorkflowId) return null;` line:
   `if (!(await hasRepoAccess(ctx.db, run.repoId, ctx.userId))) throw new Error("Not authorized");`.
   `hasRepoAccess` is already imported (`runs.ts:22`). `automationRuns.repoId`
   is required (`_validators/tableFields.ts:1305`).

3. `packages/backend/convex/_taskWorkflow/publicMutations.ts:61-173` (`handleCompletion`):

```ts
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return ignoreStaleCompletionCallback(
        `task ${String(args.taskId)} no longer exists`,
      );
    }
    if (!args.runId) {
      return ignoreStaleCompletionCallback(
```

   Insert after the `if (!task) { ... }` block and before `if (!args.runId)`:
   `if (!(await hasTaskAccess(ctx.db, task, ctx.userId))) throw new Error("Not authorized");`.
   `hasTaskAccess` is already imported (`publicMutations.ts:5`). The handler
   relies today only on the run checks (`:79-110`) and the lease fence
   (`resolveCompletionTurn`, `:112-121`).

**Already safe, do not change**: `docInterviewWorkflow.ts:281`,
`testGenWorkflow.ts:344`, `evaluationWorkflow.ts:466` and `:617`,
`projectInterviewWorkflow.ts:517` (calls `getProjectWithAccess`, which
throws), `_sessions/workflow.ts:1610`, and `summarizeWorkflow.ts:176` (checks
`session.userId !== ctx.userId` after the settle; a throw rolls the mutation
back, so this is safe).

### Behaviour the tests rely on

`settleAgentTurnCompletion` (`_chat/turnStore.ts:505-526`) and
`resolveCompletionTurn` (`:360-373`) return `legacy` / `stale` when no
`turnId` + `leaseGeneration` is sent, so an owner call with no fence returns
`null` after passing the check. A stranger call with no fence only throws if
the check runs **before** the fence.

### Conventions (quoted)

From `CLAUDE.md`:
- "No `any`, `unknown`, `as`, or non-null `!`. No `isRecord(object: unknown)` — parse at the boundary (Zod). Hard types → rethink design."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary."
- "Eliminate duplication, centralise your changes so its easier to update them" — reuse the helpers above.

Tests must exercise behaviour. The lint rule `eva/no-source-text-in-tests`
(`scripts/oxlint-plugin-eva/rules/no-source-text-in-tests.mjs`) bans tests
that read source files as text. Do NOT write a source-slicing "contract" test.

Durable-workflow rule: these handlers are referenced by string from the
sandbox (`"taskWorkflow:handleCompletion"`, `workflowDefinition.ts:196`) and
by in-flight workflow journals. Do NOT rename, move or remove any export. Do
not change their `args`.

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm --filter @eva/backend typecheck` | exit 0, no errors |
| Targeted tests | `pnpm --filter @eva/backend test -- tests/repoAccessGuards.test.ts tests/chatCompletionFenceArgs.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

NEVER run `npx convex codegen`, `convex dev` or `convex deploy`. Two backend
tests in `tests/sessionChatTabs.test.ts` already fail at planning time; they
are not yours. Run only the targeted files above.

## Suggested executor toolkit

- `convex-rules` skill, if available, for Convex mutation conventions.
- Read `packages/backend/tests/repoAccessGuards.test.ts` in full before Step 2; it is the test pattern.

## Scope

**In scope** (the only files you should modify):
- `packages/backend/convex/prRecapWorkflow.ts`
- `packages/backend/convex/_automations/runs.ts`
- `packages/backend/convex/_taskWorkflow/publicMutations.ts`
- `packages/backend/tests/repoAccessGuards.test.ts`
- `internal/changelog/2026-11.md` (one entry)

**Out of scope**:
- The seven already-safe handlers listed above.
- `functions.ts`, `_docs/access.ts` — reuse, do not edit.
- Any other public mutation.
- `callback-src/**` and the sandbox JWT — the caller side is correct.

## Git workflow

- Stay on the current branch. Do NOT create a branch, push or open a PR unless the operator says so.
- Conventional commits, matching `git log` (e.g. `fix(github): stop late PR webhooks from reopening a merged PR`). Suggested: `fix(backend): check access in recap, automation and task completion callbacks`.

## Steps

### Step 1: Add the check to the three handlers

Make the three inserts described in "Current state", with the exact message
`"Not authorized"` (the tests assert it). Each check must come before
`settleAgentTurnCompletion(` / `resolveCompletionTurn(` /
`sendCompletionEvent(` in its handler. Add the one new import in
`prRecapWorkflow.ts`.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.
**Verify**: `grep -c "Not authorized" packages/backend/convex/prRecapWorkflow.ts` → `1` (was `0`).
**Verify**: `grep -c "Not authorized" packages/backend/convex/_automations/runs.ts` → `2` (was `1`).
**Verify**: `grep -c "Not authorized" packages/backend/convex/_taskWorkflow/publicMutations.ts` → `2` (was `1`).

### Step 2: Add behaviour tests with convex-test

In `packages/backend/tests/repoAccessGuards.test.ts`, add a new
`describe("sandbox completion callbacks refuse callers without repo access", ...)`
that reuses the existing `fixture()` (lines 28-87: `t`, `owner`, `stranger`,
`repoId`, `docId`, `taskId`). Add three tests, each wrapped with `TIMEOUT_MS`
like the existing ones. Use this reply payload (the shape of
`completionCallbackArgs`, `_validators/shapes.ts:53-60`):
`{ success: true, result: "pwned", error: null, activityLog: null }`.

1. **PR recap**: `f.t.run` patch `f.docId` with `{ kind: "pr-recap", activeWorkflowId: "wf-recap" }`. Then
   - `f.stranger.mutation(api.prRecapWorkflow.handleCompletion, { docId: f.docId, ...reply })` → `rejects.toThrow("Not authorized")`.
   - The same call as `f.owner` → `resolves.toBeNull()`.
2. **automation run**: `f.t.run` insert an `automations` row on `f.repoId` (copy the field set from `tests/automationRunTerminal.test.ts:100-111`, `createdBy` = the owner's user id — look it up by `clerkId`, or return it from the fixture by adding `ownerUserId` to the returned ids), then an `automationRuns` row `{ automationId, repoId: f.repoId, status: "running", startedAt: Date.now(), acknowledged: false, activeWorkflowId: "wf-auto" }`. Stranger call to `api._automations.runs.handleCompletion` with `{ automationRunId, ...reply }` → rejects `"Not authorized"`; owner → `null`.
3. **task run**: `f.stranger.mutation(api.taskWorkflow.handleCompletion, { taskId: f.taskId, ...reply })` → rejects `"Not authorized"`; owner → `null` (no `runId`, so it is ignored as stale).

Do not add a fence to the stranger calls; the stranger throws only when the
check runs before the fence. If `api._automations.runs.handleCompletion` is
not the generated path, find the path with
`grep -rn "handleCompletion" packages/backend/convex/_generated/api.d.ts` — do
not run codegen.

**Verify**: `pnpm --filter @eva/backend test -- tests/repoAccessGuards.test.ts` → all pass, including 3 new tests.
**Verify (red check)**: temporarily remove the new check from `_automations/runs.ts`, rerun → the automation test fails; restore it.

### Step 3: Related tests, lint and changelog

Add one entry at the top of `internal/changelog/2026-11.md`, directly under
`# Changelog — November 2026`, in the format from
`internal/changelog/README.md` (`## <Title> - 2026-MM-DD` + bullets): what
changed (PR recap, automation run and task run completion callbacks now
check doc/repo/task access before the lease fence) and why (`authMutation`
only authenticates).

**Verify**: `pnpm --filter @eva/backend test -- tests/repoAccessGuards.test.ts tests/chatCompletionFenceArgs.test.ts` → all pass.
**Verify**: `pnpm lint` → exit 0.

## Test plan

- `tests/repoAccessGuards.test.ts`: 3 new convex-test cases (PR recap, automation run, task run): stranger rejected with `"Not authorized"`, owner accepted (`null`).
- Pattern: the existing tests in `tests/repoAccessGuards.test.ts` (fixture, `withIdentity`, `workflow.register(t)`, fake timers).
- Unchanged and must still pass: `tests/chatCompletionFenceArgs.test.ts` (task completion with a superseded lease, line ~60).

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] The two targeted test files pass; 3 new tests exist
- [ ] `pnpm lint` exits 0
- [ ] `git diff --stat` lists only in-scope files
- [ ] No export renamed or removed: `git diff 478be7912 -- packages/backend/convex | grep "^-export const"` returns nothing
- [ ] Changelog entry added; `plans/README.md` row updated if the file exists

## STOP conditions

Stop and report (do not improvise) if:

- A handler no longer has the early-return line quoted, or already has an access check.
- A test shows the owner call throwing `"Not authorized"`, or a real launcher passes a user without access: for example an automation whose `createdBy` left the team, or a task run started for a `draft` task by a user who is not its creator. Report the site; do not loosen the check.
- Typecheck needs `as`, `!`, `any` or `unknown` to compile.
- Adding the `./_docs/access` import to `prRecapWorkflow.ts` creates an import cycle error.
- You find another `authMutation` completion handler without a check that is not listed here — list it in your report; do not fix it here.

## Maintenance notes

- A callback whose launching user loses access mid-run now throws; the turn then ends through the lease reconciler instead of saving a result. That matches the other completion handlers.
- Any new `handle*Completion = authMutation` must check access before the fence and get a stranger test in `repoAccessGuards.test.ts`.
- Reviewer focus: the check is before the fence in all three handlers, and the PR recap uses `canAccessDoc` (sibling-repo rule), not `getDocWithAccess`.
- Deferred: `summarizeWorkflow.ts` checks ownership after `settleAgentTurnCompletion`. It is safe (a throw rolls back); moving it is cosmetic.
- Deferred: a lint rule that enforces the check on every completion handler. Source-text tests are banned; a rule under `scripts/oxlint-plugin-eva/` is the allowed form if wanted later.
