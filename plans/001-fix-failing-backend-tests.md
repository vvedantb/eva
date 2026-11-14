# Plan 001: Make the backend test suite pass again by updating five out-of-date tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` if that file exists — unless a reviewer dispatched you
> and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 2042a0ac7..HEAD -- packages/backend/callback-src/tests/pendingQuestion.test.ts packages/backend/tests/sessionStopRecoveryContract.test.ts packages/backend/tests/providerAccountHandoffContract.test.ts packages/backend/callback-src/config.ts packages/backend/callback-src/runtime/pendingQuestion.ts packages/backend/convex/_sessions/sandbox.ts packages/backend/convex/_agentTasks/sandbox.ts packages/backend/convex/_projects/sandbox.ts apps/web/src/lib/components/chat/SandboxChatPanel.tsx apps/web/src/lib/components/projects/ProjectSandboxChatPanel.tsx apps/web/src/lib/components/tasks/TaskSandboxChatPanel.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

Five backend tests fail on every run. They are not flaky. Each one asserts an
older shape of code that was changed on purpose later. A red suite hides new
regressions, and every other plan must work around these failures. When this
plan lands, `pnpm --filter @eva/backend test` exits 0, and the five tests again
guard the behaviour they were written for. No production code changes.

## Current state

Confirmed at planning time with
`pnpm test -- callback-src/tests/pendingQuestion.test.ts tests/sessionStopRecoveryContract.test.ts tests/providerAccountHandoffContract.test.ts`
(run from `packages/backend`). The failures:

1. `callback-src/tests/pendingQuestion.test.ts:233` — "a non-session surface lets AskUserQuestion through instead of blocking" (times out at 5 s).
2. `tests/sessionStopRecoveryContract.test.ts:129` — "'session' imports it rather than its own".
3. Same, "'task' imports it rather than its own".
4. Same, "'project' imports it rather than its own".
5. `tests/providerAccountHandoffContract.test.ts:54` — "composer wait lives in one hook used by all three chats" (first failing assertion at line 57).

### Failure 1 — AskUserQuestion on a task chat

The test (`packages/backend/callback-src/tests/pendingQuestion.test.ts:233-243`):

```ts
  test("a non-session surface lets AskUserQuestion through instead of blocking", async () => {
    // Would hang on postQuestion/pollForAnswer if it tried to block here —
    // nothing on a task chat can answer it.
    const canUseTool = await gateFor("taskId");
    const result = await canUseTool(
      "AskUserQuestion",
      { questions: [] },
      options(),
    );
    expect(result.behavior).toBe("allow");
  });
```

The production gate (`packages/backend/callback-src/config.ts:43-75`):

```ts
/**
 * Surfaces whose chat panel renders a blocking question and writes the answer
 * back: session `ChatPanel.tsx`, `TaskSandboxChatPanel.tsx` and
 * `ProjectSandboxChatPanel.tsx` all query `pendingQuestions.getActive` on the
 * entity id and call `pendingQuestions.answer`, ...
 */
const QUESTION_ANSWERING_ENTITY_FIELDS = new Set([
  "sessionId",
  "chatId",
  "taskId",
  "projectId",
]);
...
export const BLOCKING_QUESTIONS_ENABLED =
  RUN_ID === null &&
  ENTITY_ID_FIELD !== undefined &&
  QUESTION_ANSWERING_ENTITY_FIELDS.has(ENTITY_ID_FIELD);
```

History (from `git log -S`):

- `c63d2c791` (2026-09-25, PR #825, "let task and project chat answer
  questions") added `taskId` and `projectId` to this set **on purpose**. A
  sibling test, `callback-src/tests/blockingQuestionsGate.test.ts:39-43`, already
  asserts the gate "is on for the three chat surfaces that can answer"
  (`sessionId`, `taskId`, `projectId`) and "is off for surfaces with no answering
  UI" (`docId`, `reportId`, `automationRunId`).
- `1b9c8a543` (2026-11-08, PR #1099, "automation: Add tests for past fix
  commits") added the failing test six weeks later, using the old assumption
  that a task chat cannot answer. **The test is wrong; the code is the intent.**

Why it hangs instead of failing fast: with `taskId` the gate takes the blocking
path (`callback-src/runtime/pendingQuestion.ts:133-146`), posts the question and
calls `pollForAnswer`. An earlier test in the same file
(`pendingQuestion.test.ts:~151-163`) set a persistent
`vi.mocked(client.callConvexWithRetry).mockImplementation(...)` that always
returns `{ answer: null }`, so the loop polls every 300 ms until the 10-minute
`QUESTION_WAIT_MS`, and vitest kills it at 5 s. `pollForAnswer`
(`runtime/pendingQuestion.ts:64-84`) exits at once when the signal is aborted:

```ts
  while (!signal.aborted) {
    ...
  }
  return { kind: "cancelled" };
```

Real surfaces with no answering UI (from `entityIdField:` literals in
`packages/backend/convex`): `docId` (`docInterviewWorkflow.ts:146`,
`prRecapWorkflow.ts:152`), `reportId` (`evaluationWorkflow.ts:92`),
`automationRunId` (`automationWorkflow.ts:108`).

### Failures 2–4 — shared stop-recovery delay import

The test (`packages/backend/tests/sessionStopRecoveryContract.test.ts:129-133`):

```ts
  test.each(stopPaths)("$entity imports it rather than its own", (path) => {
    expect(readSource(path.module)).toContain(
      'STUCK_STOPPING_RECOVER_MS } from "',
    );
  });
```

The three modules still import the shared constant, but now in a multi-line
import (changed by `264df6080`, 2026-10-20, PR #1008, which added
`scheduleDrainAfterStopSettles` to the same import). Example,
`packages/backend/convex/_sessions/sandbox.ts:27-30`:

```ts
import {
  scheduleDrainAfterStopSettles,
  STUCK_STOPPING_RECOVER_MS,
} from "../_sandbox/stopRecovery";
```

Same shape at `convex/_agentTasks/sandbox.ts:9-12` and
`convex/_projects/sandbox.ts:11-14`. The constant is declared once at
`convex/_sandbox/stopRecovery.ts:12` (`export const STUCK_STOPPING_RECOVER_MS = 20_000;`).
**The intent (one shared constant) still holds; only the text match is stale.**

### Failure 5 — provider account handoff hook

The test (`packages/backend/tests/providerAccountHandoffContract.test.ts:54-73`)
reads `ProjectSandboxChatPanel.tsx` and `TaskSandboxChatPanel.tsx` and expects
each to contain `useProviderAccountHandoff(`, `sandboxComposerState({` and
`isInputDisabled={composer.isInputDisabled}`.

`4c74cfe9e` (2026-11-09, PR #1097, "refactor(chat): one sandbox chat module for
tasks and projects") moved all of that into one shared component. Now:

- `apps/web/src/lib/components/projects/ProjectSandboxChatPanel.tsx:38` — `return <SandboxChatPanel binding={binding} {...panel} />;`
- `apps/web/src/lib/components/tasks/TaskSandboxChatPanel.tsx:46` — `return <SandboxChatPanel binding={binding} {...panel} />;`
- `apps/web/src/lib/components/chat/SandboxChatPanel.tsx:82-86` — `useProviderAccountHandoff({ persist: binding.persistAccount, prewarm: binding.prewarm, });`
- `SandboxChatPanel.tsx:105` — `const composer = sandboxComposerState({`
- `SandboxChatPanel.tsx:233` — `isInputDisabled={composer.isInputDisabled}`
- Session path unchanged: `apps/web/src/lib/hooks/useChatModel.ts:79` (`useProviderAccountHandoff({`) and `routes/_repo/$owner/$repo/sessions/ChatPanel.tsx:448,490`.

**The intent (one shared hook and one composer gate for all three chats) still
holds, and is now stronger.** Note: lines 62-69 of the test (the `for` loop over
panels) would also fail after line 57 is fixed, because the project and task
panel files no longer contain `sandboxComposerState({`.

### Conventions that apply

From `/tmp/repo/CLAUDE.md` (quoted):

- "No `any`, `unknown`, `as`, or non-null `!`."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary."
- "Do not run dev / lint / build unless the user asks." (The operator has authorised the commands in the table below for this plan.)
- "After medium+ changes: no banned types; `tsc` where relevant; `/changelog` (or `internal/changelog.md`)." This plan is a small test-only change; no changelog entry is needed.

Existing test files already use `as const` (`sessionStopRecoveryContract.test.ts:44`). Do not add new `as` casts.

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| One test file | `pnpm --filter @eva/backend test -- <path relative to packages/backend>` | all tests in file pass |
| Full backend suite | `pnpm --filter @eva/backend test` | exit 0 |
| Callback typecheck | `pnpm --filter @eva/backend typecheck:callback` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

NEVER run `npx convex codegen`, `convex dev` or `convex deploy` — they upload to
the linked deployment.

## Scope

**In scope** (the only files you should modify):

- `packages/backend/callback-src/tests/pendingQuestion.test.ts`
- `packages/backend/tests/sessionStopRecoveryContract.test.ts`
- `packages/backend/tests/providerAccountHandoffContract.test.ts`

**Out of scope** (do NOT touch):

- `packages/backend/callback-src/config.ts` and `callback-src/runtime/pendingQuestion.ts` — the `taskId`/`projectId` gate is intended (PR #825). Changing it to satisfy the test would regress task and project chats.
- `convex/_sessions/sandbox.ts`, `convex/_agentTasks/sandbox.ts`, `convex/_projects/sandbox.ts` — do not reformat imports to fit a text match.
- Any `apps/web` source file.
- `callbackScript.generated.ts` — no callback source changes here, so no rebuild.

## Git workflow

- Work on the current branch the operator gives you. Do not create a branch, push or open a PR unless told.
- One commit for the whole plan. Style from `git log --oneline`: conventional commits, for example `refactor(chat): one sandbox chat module for tasks and projects (#1097)`. Use: `test(backend): update five tests to current intent`.

## Steps

### Step 1: Fix the AskUserQuestion test so it uses a surface with no answering UI, and cannot hang

In `packages/backend/callback-src/tests/pendingQuestion.test.ts`, replace the
test at line 233 (inside `describe("the canUseTool gate grants MCP on every surface", ...)`)
with:

```ts
  test("a surface with no answering UI lets AskUserQuestion through instead of blocking", async () => {
    // Doc interviews, PR recaps (docId), evaluations (reportId) and automation
    // runs have no panel that answers a question, so the gate must not block.
    // Task and project chats DO answer (PR #825) — see blockingQuestionsGate.test.ts.
    // The aborted signal makes a regression fail fast with "deny" instead of
    // polling until the vitest timeout.
    const canUseTool = await gateFor("docId");
    const result = await canUseTool(
      "AskUserQuestion",
      { questions: [] },
      { toolUseID: "toolu_test", signal: AbortSignal.abort() },
    );
    expect(result.behavior).toBe("allow");
  });
```

Also update the block comment above the `describe` (lines ~206-216) only if it
says a task chat cannot answer; leave the rest of it.

**Verify**: `pnpm --filter @eva/backend test -- callback-src/tests/pendingQuestion.test.ts` → all tests pass; the run takes well under 5 s per test (no timeout).

### Step 2: Make the stop-recovery import test match a multi-line import

In `packages/backend/tests/sessionStopRecoveryContract.test.ts:129-133`, replace
the `toContain` text match with a regex that accepts any import list that names
the constant and comes from `_sandbox/stopRecovery`:

```ts
  test.each(stopPaths)("$entity imports it rather than its own", (path) => {
    const source = readSource(path.module);
    expect(source).toMatch(
      /import\s*\{[^}]*\bSTUCK_STOPPING_RECOVER_MS\b[^}]*\}\s*from\s*"\.\.\/_sandbox\/stopRecovery"/,
    );
    expect(source).not.toMatch(/const STUCK_STOPPING_RECOVER_MS\s*=/);
  });
```

The second assertion keeps the "rather than its own" half of the test name.

**Verify**: `pnpm --filter @eva/backend test -- tests/sessionStopRecoveryContract.test.ts` → all tests pass (3 previously failing now pass).

### Step 3: Point the handoff contract at the shared sandbox chat panel

In `packages/backend/tests/providerAccountHandoffContract.test.ts`:

1. Next to the other `readSource` calls (lines 18-26), add:
   ```ts
   const sandboxChatPanelSource = readSource(
     "../../../apps/web/src/lib/components/chat/SandboxChatPanel.tsx",
   );
   ```
2. In the test "composer wait lives in one hook used by all three chats" (line 54):
   - Replace the two lines that expect `useProviderAccountHandoff(` in `projectPanelSource` and `taskPanelSource` with:
     ```ts
     // Tasks and projects render one shared panel (#1097); sessions use useChatModel.
     expect(sandboxChatPanelSource).toContain("useProviderAccountHandoff(");
     expect(projectPanelSource).toContain("<SandboxChatPanel ");
     expect(taskPanelSource).toContain("<SandboxChatPanel ");
     ```
     Keep `expect(sessionModelSource).toContain("useProviderAccountHandoff(");`.
   - Change the `for` loop list from `[projectPanelSource, taskPanelSource, sessionPanelSource]` to `[sandboxChatPanelSource, sessionPanelSource]`.

Do not change any other test in this file.

**Verify**: `pnpm --filter @eva/backend test -- tests/providerAccountHandoffContract.test.ts` → all tests pass.

### Step 4: Run the full suite and the static checks

**Verify**:
- `pnpm --filter @eva/backend test` → exit 0, no failed tests.
- `pnpm --filter @eva/backend typecheck:callback` → exit 0 (covers the edited callback test only if it is in that tsconfig; exit 0 is the requirement either way).
- `pnpm lint` → exit 0.
- `git status --porcelain` → only the three in-scope files are modified.

Then commit: `git commit -am "test(backend): update five tests to current intent"`.

## Test plan

- No new test files. Three existing tests are corrected (listed in Steps 1-3).
- The AskUserQuestion test now uses `docId`, a real no-answer surface, and an aborted signal so it can never hang again.
- The import test now also asserts no module declares its own copy of the constant.
- Pattern to follow: `callback-src/tests/blockingQuestionsGate.test.ts` (surface lists) and the existing `readSource` helpers in each file.
- Verification: `pnpm --filter @eva/backend test` → exit 0.

## Done criteria

- [ ] `pnpm --filter @eva/backend test` exits 0
- [ ] `grep -n 'gateFor("taskId")' packages/backend/callback-src/tests/pendingQuestion.test.ts` shows no line inside the AskUserQuestion test (the MCP `for` loop may still use `taskId`)
- [ ] `grep -c "'STUCK_STOPPING_RECOVER_MS } from \"'" packages/backend/tests/sessionStopRecoveryContract.test.ts` → 0
- [ ] `grep -n "sandboxChatPanelSource" packages/backend/tests/providerAccountHandoffContract.test.ts` → at least 3 matches
- [ ] `pnpm lint` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated, if that file exists

## STOP conditions

Stop and report back (do not improvise) if:

- `QUESTION_ANSWERING_ENTITY_FIELDS` in `callback-src/config.ts` no longer contains `taskId` and `projectId`, or `blockingQuestionsGate.test.ts` no longer asserts they can answer — then the intent has changed again and the fix in Step 1 may be wrong.
- Any of `_sessions/sandbox.ts`, `_agentTasks/sandbox.ts`, `_projects/sandbox.ts` declares its own `STUCK_STOPPING_RECOVER_MS` — that is a real regression, not a stale test.
- `SandboxChatPanel.tsx` does not call `useProviderAccountHandoff(` or `sandboxComposerState({`, or the project/task panels do not render `<SandboxChatPanel` — the refactor has moved on and Step 3 needs re-planning.
- After Steps 1-3, the full suite has failures other than these five. Report them; do not fix them in this plan.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- These are source-text "contract" tests. They break on harmless reformatting. Prefer regexes or structural checks (as in Step 2) when you add new ones.
- The stale test in Step 1 came from an automation that wrote tests for old fix commits (PR #1099) without checking later intent. Reviewers of such automated test PRs should check `git log` on the code under test.
- The earlier test "a released question is saved for the turn's message" leaves a persistent `mockImplementation` on `callConvexWithRetry`. It is harmless after Step 1, but a later test that takes the blocking path will inherit it. Deferred: adding `vi.mocked(...).mockReset()` in `afterEach` is a separate clean-up.
