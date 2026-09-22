# Scope check: extending it beyond sessions

How the turn scope check works, why only sessions get it, and the exact order to extend it to quick-task chat and project chat. Companion to [`docs/eva-convex.md`](./eva-convex.md).

Every claim below is cited `path:line` against the code. Where the code and this doc drift, the code wins — fix the doc.

## What exists today

After an assistant turn finishes, Eva fetches the diff between the turn's `beforeSha` and `afterSha` and asks TypeSafe Jev whether it contains changes the prompt did not ask for. The verdict lands on the assistant `messages` row as the optional `scopeCheck` field (`_validators/tableFields.ts:967`, shape at `_validators/shapes.ts:145`), and the chat renders a chip from it.

Flow: `scheduleScopeCheck` (`_scopeCheck/mutations.ts:31`) → `scopeCheck.ts:43` `evaluateTurn` (`"use node"` action) → `_scopeCheck/queries.ts:45` `getTurnContext` for shas, repo and prompt → `_github/prDiff.ts` `fetchCompareDiff` (called at `scopeCheck.ts:55`) → `_scopeCheck/hunks.ts:159` `splitDiffIntoHunks`, dropping lockfiles and generated output (`hunks.ts:91` `isIgnoredFile`) → one requested/necessary Jev pair per hunk (`_scopeCheck/verdict.ts:37`) plus one whole-diff headline question (`verdict.ts:61`) → `verdict.ts:129` `summariseScopeCheck` → `_scopeCheck/mutations.ts:13` `setScopeCheck`.

Every failure path leaves `scopeCheck` absent and the chip simply does not render (`scopeCheck.ts:5-12`, `_scopeCheck/mutations.ts:27-29`).

| Surface | Chip today | Why |
|---|---|---|
| Session chat | Yes | Callback stamps the shas and `_sessions/workflow.ts:1017-1024` persists them. |
| Session `/loop` synthetic turn | Yes | Own scheduling call at `_sessions/workflow.ts:1653`. |
| Quick-task chat | No | Shas never stamped, and never persisted if they were. |
| Project chat | No | Same two blockers. |
| Quick-task **runs** | No | Different problem — out of scope, see below. |

## Why sessions only

Two independent blockers. Both must be fixed; fixing either alone changes nothing.

**1. The callback refuses to stamp.** `appendTurnCheckpoint` (`callback-src/runtime/turnCheckpoint.ts:74`) opens with `if (ENTITY_ID_FIELD !== "sessionId") return;`. Task chat runs with `entityIdField: "taskId"` (`agentTaskChatWorkflow.ts:237`) and project chat with `"projectId"` (`projectChatWorkflow.ts:234`), so neither ever reaches the stamp.

> **Prod incident, 2026-09-02.** Task and project chat turns also run on `eva/` branches with no `RUN_ID`, so they pass every other condition in `appendTurnCheckpoint` (`turnCheckpoint.ts:76-77`). Before this gate existed, their completion payload carried shas the Convex args validator rejected: `ArgumentValidationError` killed the whole call, the reply was lost and the turn hung on "Working…" (`turnCheckpoint.ts:68-72`, `_validators/shapes.ts:19-26`). **Anyone relaxing this gate must land step 1 first, or reproduce that outage.**

**2. The persistence chain drops them.** For sessions the shas travel `handleCompletion` args → `sendCompletionEvent` payload (`_sessions/workflow.ts:1784-1787`) → `awaitEvent` → `saveResult` call (`:590-593`) → `saveResult` args (`:984`) → `extraPatch` (`:1017-1024`) → the message row. Task and project chat break that chain in three places each:

| Link | Session | Task | Project |
|---|---|---|---|
| `handleCompletion` args accept shas | `_sessions/workflow.ts:1743` | yes, `agentTaskChatWorkflow.ts:1111` | yes, `projectChatWorkflow.ts:978` |
| Forwarded into the completion event | `_sessions/workflow.ts:1784-1787` | **no**, `agentTaskChatWorkflow.ts:1136-1142` | **no**, `projectChatWorkflow.ts:1002-1008` |
| Forwarded from `awaitEvent` into `saveResult` | `:590-593` | **no**, `agentTaskChatWorkflow.ts:914-922` | **no**, `projectChatWorkflow.ts:811-819` |
| `saveResult` args declare them | `:984` | **no**, `agentTaskChatWorkflow.ts:1060-1069` | **no**, `projectChatWorkflow.ts:926-935` |

The event validator itself already carries them — all three events use `workflowCompleteValidator`, which spreads `turnCheckpointArgs` (`_validators/shapes.ts:46`; events at `agentTaskChatWorkflow.ts:273`, `projectChatWorkflow.ts:270`, `_sessions/workflow.ts:69`). Only the hand-written payload objects drop them.

## What already works and needs no change

- **Arg shape.** `turnCheckpointArgs` (`_validators/shapes.ts:27`) is spread into every sandbox-facing completion receiver. `tests/turnCheckpointCompletionContract.test.ts:82-102` asserts every public `authMutation` whose args carry `success` + `activityLog` contains `...turnCheckpointArgs` and does not redeclare `beforeSha:`, names the six key receivers, and requires at least 15 of them. So relaxing the callback gate cannot resurrect the 2026-09-02 rejection — but land the persistence side first anyway.
- **Scheduling.** `writeAssistantTurnResult` calls `scheduleScopeCheck` unconditionally (`_chat/chatResult.ts:120`), and all three surfaces reach it through `applyChatTurnResult` (`chatResult.ts:192`, called at `_sessions/workflow.ts:1026`, `agentTaskChatWorkflow.ts:1075`, `projectChatWorkflow.ts:941`). Once the shas are in `extraPatch`, scheduling is automatic. `scheduleScopeCheck` no-ops when either sha is absent or they are equal (`_scopeCheck/mutations.ts:36-38`).
- **Repo resolution.** `resolveRepoId` (`_scopeCheck/queries.ts:18`) already normalises `messages.parentId` against `sessions`, `projects` and `agentTasks`. Wrinkle: `agentTaskFields.repoId` is optional (`_validators/tableFields.ts:288`), so `queries.ts:34-36` returns null and a repo-less task yields no verdict. Correct, silent, not a bug.
- **UI.** `ChatMessage` renders the chip at `apps/web/src/lib/components/chat/ChatMessage.tsx:458` from `message.scopeCheck` alone. All three surfaces reach it through the shared `ChatBody` (`ChatBody.tsx:397`), which quick-task chat mounts at `tasks/TaskSandboxChatPanel.tsx:335` and project chat at `projects/ProjectSandboxChatPanel.tsx:294`. Both already thread `onViewDiff` (`:411` / `:357`), and the chip degrades to non-clickable rows without it (`_components/ScopeCheckChip.tsx:112`). Only caveat: the chip is gated on `showChangedFiles`, which `ChatBody.tsx:401` derives from `!simpleView` — a user preference (`lib/hooks/useSimpleView.ts:7`), not a surface distinction.

## Step by step

Order matters. Steps 1-2 are safe to ship alone: they make the surfaces ready to persist shas that never arrive.

1. **Persist on task chat.** In `agentTaskChatWorkflow.ts`: add `...turnCheckpointArgs` to `saveResult` args (`:1060`); build an `extraPatch` in its handler copying `args.beforeSha`/`afterSha` and `args.beforeShas`/`afterShas` when each pair is defined, mirroring `_sessions/workflow.ts:994-1024`, and pass it to `applyChatTurnResult` (`:1075`); forward all four from `result` at the `awaitEvent` call site (`:914-922`) and from `args` in `handleCompletion`'s `sendCompletionEvent` payload (`:1136-1142`). *Verify:* `pnpm --filter @eva/backend typecheck` passes and nothing else changed — no turn carries shas yet, so behaviour is identical.
2. **Persist on project chat.** Same four edits in `projectChatWorkflow.ts` (`:926`, `:941`, `:811-819`, `:1002-1008`). *Verify:* as above.
   - Note `AssistantTurnResultPatch` (`_chat/chatResult.ts:80-95`) declares only the scalar shas. Sessions pass `beforeShas`/`afterShas` through a typed local variable, so excess-property checking does not fire and the keys survive the spread at `chatResult.ts:115-118`. Copy that pattern or widen the type; do not inline the object literal at the call site.
3. **Synthetic turns (optional, but the `/loop` path).** Task and project synthetic turns finalise in their own daemons, not through `writeAssistantTurnResult`: `_chat/taskChatDaemon.ts:327` and `_chat/projectChatDaemon.ts:324` patch the message directly. Both already accept the shas (`:287` / `:281`) and drop them. To cover these, add the shas to the `patch` object (`taskChatDaemon.ts:307`, `projectChatDaemon.ts:304`) and call `scheduleScopeCheck` after the patch, exactly as sessions do at `_sessions/workflow.ts:1651-1657`. *Verify:* typecheck, then a `/loop` continuation on a task gets a chip.
4. **Relax the callback gate.** Only now. In `callback-src/runtime/turnCheckpoint.ts:75`, widen `ENTITY_ID_FIELD !== "sessionId"` to also allow `"taskId"` and `"projectId"` — an allow-list, not a deletion: other surfaces (`"docId"`, `"reportId"`, `"automationRunId"`) are untested here. Leave `:76-77` alone; the `RUN_ID` and `eva/` branch conditions still matter. Update the doc comment at `:62-73` to describe the new rule. Its first clause ("`sessionWorkflow:handleCompletion` is the one completion mutation that accepts the shas") is already stale: every receiver accepts them now (`_validators/shapes.ts:27`, enforced by `tests/turnCheckpointCompletionContract.test.ts:82-102`). The persistence half of that sentence is what still holds. *Verify:* `pnpm --filter @eva/backend test` — `tests/turnCheckpointCompletionContract.test.ts` still passes (it asserts the four `args.<name> =` assignments, `:62-69`).
5. **Rebuild the bundle.** `pnpm --filter @eva/backend build:callback`. The sandbox runs `convex/_sandbox_runtime/callbackScript.generated.ts`, written by `scripts/build-callback-script.mjs:50-53`; `callbackScript.ts` is a one-line re-export of it. **Never hand-edit the generated file** — the next build overwrites it. The build typechecks `callback-src` first and refuses to bundle on failure (`build-callback-script.mjs:17-29`). `predeploy` runs it automatically (`packages/backend/package.json:22`).
6. **Deploy.** `pnpm --filter @eva/backend deploy` (`convex deploy`). Existing sandboxes keep the old bundle until they restart; test on a fresh quick-task sandbox.

## Verification

- `pnpm --filter @eva/backend typecheck`, `pnpm --filter @eva/backend typecheck:callback`.
- `pnpm --filter @eva/backend test` — `tests/turnCheckpointCompletionContract.test.ts`, `tests/scopeCheckHunks.test.ts`, `tests/scopeCheckVerdict.test.ts`. Web: `apps/web/src/lib/components/chat/_components/scopeCheckSummary.test.ts`.
- **In a real chat:** open a quick task's sandbox chat, ask for one small change, and add an obviously unrelated edit to the prompt. The turn completes, then a few seconds later a chip appears under the reply. Confirm `beforeSha`/`afterSha` landed on the assistant `messages` row first — no shas means step 4 or 5 did not take effect.
- **Force a check on one message:** `cd packages/backend && npx convex run scopeCheck:evaluateTurn '{"messageId":"…","attempt":1}'` (add `--prod` for production). This is how the feature was validated originally. `getTurnContext` returns null when `scopeCheck` is already set (`_scopeCheck/queries.ts:60`), so a re-run is a no-op unless the field is cleared first — and also returns null when either sha is missing (`:63`), the shas are equal (`:64`), the repo does not resolve (`:66`), or no non-system user message precedes the reply (`:69-82`).

## Risks and rollback

- **The 2026-09-02 hang.** Shipping step 4 before steps 1-2 is the failure mode, not a hypothetical. The contract test now guards the arg shape, but the ordering above costs nothing.
- **Cost.** One Jev call per judged hunk plus one headline call per turn. Hunks are capped at `MAX_JUDGED_HUNKS = 60` (`_scopeCheck/verdict.ts:17`), run six at a time (`:19`), each clipped to 3,000 characters (`hunks.ts:57`); the headline diff is clipped to 30,000 characters (`verdict.ts:30`) and the prompt to 8,000 (`:32`). Worst case per turn is therefore 61 calls. Extending to two more surfaces roughly triples the feature's spend — watch the `eva-scope-check` tag (`scopeCheck.ts:36`).
- **Latency, not blocking.** Judging is scheduled, never inline (`_scopeCheck/mutations.ts:25-30`), and retries up to three times at 30 s when GitHub has not caught up with the push (`scopeCheck.ts:39-41`, `:62-72`).
- **Rollback is un-forwarding the shas.** Revert steps 1-2 (or re-tighten step 4 and rebuild). Everything downstream fails open: no shas means no scheduling, and `scopeCheck` simply stays absent. No migration, no cleanup — existing verdicts remain valid and keep rendering.

## Out of scope: quick-task runs

A quick task's **run** (the initial autonomous execution, not its chat) cannot use this design.

- `appendTurnCheckpoint` bails on `RUN_ID` (`turnCheckpoint.ts:76`).
- `persistTurnWork` skips committing and pushing for runs entirely (`callback-src/runtime/turnPersist.ts:160`, `REQUIRE_TASK_COMMIT || RUN_ID`), because the run workflow owns commit, push and PR semantics — the commit gate must keep failing agents that did not commit (`turnPersist.ts:153-156`).

So a run has no turn diff to judge. Covering runs would mean judging the **PR diff** (`_github/prDiff.ts:74` `fetchPrDiff`) against the **task description** rather than a turn diff against a prompt: a different unit of work, a different question, and a different point in the lifecycle. That is a new design, not an extension of this one.

## Open questions

- **Calibration.** `FLAG_THRESHOLD = 0.5` (`verdict.ts:23`) and the UI's `SCOPE_REVIEW_THRESHOLD` / `SCOPE_FLAGGED_THRESHOLD` (`apps/web/src/lib/components/chat/_components/scopeCheckSummary.ts:13-15`) were set on session traffic. Task and project chat prompts are shorter and more mechanical; re-check the false-positive rate on real traffic before trusting the chip's number there.
- **Task runs.** See above — decide whether the PR-diff-versus-description question is worth building at all.
