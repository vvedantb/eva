# Scope check: which surfaces get a verdict

How the turn scope check decides which chat surfaces get a verdict, what each surface had to wire up to qualify, and how to add a fourth. Companion to [`docs/eva-convex.md`](./eva-convex.md).

Every claim below is cited `path:line` against the code. Where the code and this doc drift, the code wins — fix the doc.

## What exists today

After an assistant turn finishes, Eva fetches the diff between the turn's `beforeSha` and `afterSha` and asks TypeSafe Jev whether it contains changes the prompt did not ask for, what a user would see change, and whether the reply mentioned it. The verdict lands on the assistant `messages` row as the optional `scopeCheck` field (`_validators/tableFields.ts:967`, shape at `_validators/shapes.ts:145`), and the chat renders a chip from it.

Flow: `scheduleScopeCheck` (`_scopeCheck/mutations.ts:31`) → `scopeCheck.ts` `evaluateTurn` (`"use node"` action) → `_scopeCheck/queries.ts` `getTurnContext` for shas, repo, prompt and reply → `_github/prDiff.ts:314` `fetchCompareDiff` → `_scopeCheck/hunks.ts:159` `splitDiffIntoHunks`, dropping lockfiles and generated output (`hunks.ts:91` `isIgnoredFile`) → one Jev call per hunk carrying requested/necessary (`_scopeCheck/verdict.ts`) **and** the `kind` choice (`_scopeCheck/describe.ts`) → one whole-diff headline question → one mention question per *flagged* hunk, against the reply → `summariseScopeCheck` → `_scopeCheck/mutations.ts:13` `setScopeCheck`.

### Three questions, three jobs

| Question | Asked of | Answers |
|---|---|---|
| `requested` / `necessary` | every judged hunk | Is this in scope? Both must lean negative to flag (`FLAG_THRESHOLD`). |
| `kind` | every judged hunk, same call | What does a user see change? One of nine kinds (`CHANGE_KIND_LABELS`), stored as `changeKindValidator`. |
| `mentioned` | flagged hunks only | Did the reply tell the user? Below `MENTION_THRESHOLD` the chip says "not mentioned". |

`describe.ts` is pure: `changeDetail` diffs the hunk's `+`/`-` sides for icon components, colour literals and quoted copy to produce `Icon changed (IconAward → IconTrophy)`; `humaniseSurface` turns a path into a screen name. Both are best-effort — `summary`, `surface`, `kind` and `mentioned` are all optional on the stored hunk, and the chip falls back to the file path and `@@` header, which is also what rows written before this pass carry.

**Why `mentioned` exists.** The motivating miss (carepulse-ts, trophy icon, PR #1889) was not caught by scope alone: the change was unrequested *and* unreported. An unrequested change the reply names is a decision a reviewer can accept or reject; an unnamed one reaches production unseen. An absent `mentioned` means the question went unanswered — never "the reply stayed silent".

Every failure path leaves `scopeCheck` absent and the chip simply does not render (`scopeCheck.ts:8-10`, `_scopeCheck/mutations.ts`).

## Where the verdict goes

Two surfaces, and the second is the one that matters for production.

**The chat chip.** `ChatMessage` renders `message.scopeCheck` (see UI, below).

**The pull request.** `_github/prScopeSection.ts` builds a "Changes nobody asked for" block between `<!-- eva-scope-check -->` markers; `_github/prScopeCheck.ts` `publishScopeSection` reads the PR's commits, asks `_scopeCheck/queries.ts` `flaggedForShas` for every verdict recorded against those shas, and patches the body. Two triggers:

- `setScopeCheck` (`_scopeCheck/mutations.ts`) schedules a publish whenever a verdict with flagged hunks lands and the chat has a PR. A quick task's PR lives on its newest `agentRuns` row, not on the task.
- The `pull_request` webhook (`http.ts`) schedules `publishScopeSectionForPr` on `opened`/`reopened`, which resolves the repo by owner/name. This is the path for a PR Eva did not open.

The lookup is keyed on `messages.afterSha` (index `by_after_sha`) rather than on the chat, so a PR that re-lands Eva's commits still carries the warning. Both blocks share `prBodyBlocks.ts`, so rewriting the reviewer description never disturbs the scope block and vice versa. An empty verdict removes the block rather than writing a reassuring heading — its presence is the signal.

> **Known gap: a squashed extract.** Sha-keying only matches commits that survive intact. `git merge --squash` (or a rebase, or a hand-copied branch) mints new shas, and the original incident reached production exactly that way — a person copied Eva's files onto a clean branch and opened PR #1889. That PR would still show nothing. Closing it means matching on file paths instead of shas, which trades exactness for noise; decide that deliberately rather than by accident.

All three chat surfaces now judge. Quick-task **runs** do not.

| Surface | Chip | Where the shas land |
|---|---|---|
| Session chat | Yes | `extraPatch` at `_sessions/workflow.ts:1017-1024`, passed to `applyChatTurnResult` (`:1026`). |
| Quick-task chat | Yes | `extraPatch` at `agentTaskChatWorkflow.ts:1086-1099`, passed at `:1101`. |
| Project chat | Yes | `extraPatch` at `projectChatWorkflow.ts:952-965`, passed at `:967`. |
| Session `/loop` synthetic turn | Yes | Daemon patch and its own `scheduleScopeCheck` (`_sessions/workflow.ts:1639-1646`, `:1653`). |
| Quick-task and project `/loop` | Yes | Same shape in their daemons (`_chat/taskChatDaemon.ts:328-335`, `:342`; `_chat/projectChatDaemon.ts:325-332`, `:339`). |
| Quick-task **runs** | No | Never stamped — `appendTurnCheckpoint` bails on `RUN_ID` (`turnCheckpoint.ts:96`). Out of scope, see below. |

## How a surface qualifies

Two halves, both required. Stamping without persistence writes shas nobody reads; persistence without stamping waits for shas that never arrive.

**1. The callback must stamp.** `appendTurnCheckpoint` (`callback-src/runtime/turnCheckpoint.ts:89`) returns early unless all three hold:

- The surface's `ENTITY_ID_FIELD` is in `CHECKPOINTED_ENTITY_ID_FIELDS` (`turnCheckpoint.ts:63`): `sessionId`, `taskId`, `projectId`. `docId`, `reportId` and `automationRunId` are excluded — untested, and some never run on an `eva/` branch (gate at `:90-95`).
- No `RUN_ID`, and a turn-start sha was recorded (`:96`).
- The branch starts with `eva/` (`:97`).

**2. The persistence chain must carry them.** Four links per surface, from the sandbox callback to the message row. Sessions: `handleCompletion` args (`_sessions/workflow.ts:1743`) → `sendCompletionEvent` payload (`:1784-1787`) → the `awaitEvent` → `saveResult` call site (`:590-593`) → `saveResult` args (`:984`) → `extraPatch` (`:1017-1024`). Quick-task chat mirrors it at `agentTaskChatWorkflow.ts:1138`, `:1169-1172`, `:922-925`, `:1074`, `:1086-1099`; project chat at `projectChatWorkflow.ts:1005`, `:1035-1038`, `:819-822`, `:940`, `:952-965`.

> **Why an allow-list and not an unconditional stamp — prod, 2026-09-02.** Task and project chat also run on `eva/` branches with no `RUN_ID`, so they passed every other condition. Before any gate existed their completion payload carried shas the Convex args validator rejected: `ArgumentValidationError` killed the whole call, the reply was lost and the turn hung on "Working…". The gate landed as sessions-only and was widened here once the persistence side existed. Every completion receiver now spreads `turnCheckpointArgs` (`_validators/shapes.ts:27`, enforced by `tests/turnCheckpointCompletionContract.test.ts:82-102`), so a fourth surface added to the list today would silently drop the shas rather than hang. The list stays so a surface only stamps once it can persist.

## What needs no change

- **Arg shape.** `turnCheckpointArgs` (`_validators/shapes.ts:27`) is spread into every sandbox-facing completion receiver, and into `workflowCompleteValidator` (`:46`), which all three complete events use (`agentTaskChatWorkflow.ts:273`, `projectChatWorkflow.ts:270`, `_sessions/workflow.ts:69`).
- **Scheduling.** `writeAssistantTurnResult` calls `scheduleScopeCheck` unconditionally (`_chat/chatResult.ts:120`), and all three surfaces reach it through `applyChatTurnResult` (`chatResult.ts:136`). Once the shas are in `extraPatch`, scheduling is automatic. `scheduleScopeCheck` no-ops when either sha is absent or they are equal (`_scopeCheck/mutations.ts:36-38`).
- **Repo resolution.** `resolveRepoId` (`_scopeCheck/queries.ts:18`) normalises `messages.parentId` against `sessions`, `projects` and `agentTasks`. Wrinkle: `agentTaskFields.repoId` is optional (`_validators/tableFields.ts:288`), so `queries.ts:32-35` returns null and a repo-less task yields no verdict. Correct, silent, not a bug.
- **UI.** `ChatMessage` renders the chip at `apps/web/src/lib/components/chat/ChatMessage.tsx:458` from `message.scopeCheck` alone. All three surfaces reach it through the shared `ChatBody` (`ChatBody.tsx:397`), which quick-task chat mounts at `tasks/TaskSandboxChatPanel.tsx:335` and project chat at `projects/ProjectSandboxChatPanel.tsx:294`. Both thread `onViewDiff` (`:411` / `:357`); the chip degrades to non-clickable rows without it (`_components/ScopeCheckChip.tsx:112`). The chip itself is not gated on `showChangedFiles` — simple view (`lib/hooks/useSimpleView.ts:7`) hides the changed-files card but keeps the verdict, since a reader on the simplified UI is the one least likely to go looking for it. Only the hover card's per-hunk links are gated, because simple view bounces away from the diff tab.

## Adding a further surface

Order matters: persistence first, gate second, rebuild third. Steps 1-2 are safe to ship alone — they ready a surface to persist shas that do not arrive yet. Quick-task chat is the worked example; copy it.

1. **Persist on the surface's chat workflow.** Four edits, mirroring `agentTaskChatWorkflow.ts`: add `...turnCheckpointArgs` to `saveResult` args (`:1074`); build an `extraPatch` in its handler and pass it to `applyChatTurnResult` (`:1086-1101`); forward all four shas from `result` at the `awaitEvent` call site (`:922-925`); forward them from `args` in `handleCompletion`'s `sendCompletionEvent` payload (`:1169-1172`). *Verify:* `pnpm --filter @eva/backend typecheck` passes and behaviour is unchanged.
   - **Trap.** `AssistantTurnResultPatch` (`_chat/chatResult.ts:80-95`) declares only the scalar shas. Build `extraPatch` as a typed local so excess-property checking does not fire on the per-repo arrays and the keys survive the spread at `chatResult.ts:115-118` and `:177`. Do not inline the object literal at the call site. Copy each pair only when both halves are defined — a lone `afterSha` makes the turn look like it changed code from nothing.
2. **Persist on synthetic turns**, if the surface has a `/loop`. These finalise in their own daemon, not through `writeAssistantTurnResult`. Add the shas to the `patch` object and call `scheduleScopeCheck` after `ctx.db.patch`, as in `_chat/taskChatDaemon.ts:328-342`. *Verify:* typecheck, then a `/loop` continuation gets a chip.
3. **Add the entity field to the allow-list.** Only now. Append it to `CHECKPOINTED_ENTITY_ID_FIELDS` (`callback-src/runtime/turnCheckpoint.ts:63`) and update the doc comment at `:69-88`. Leave `:96-97` alone; the `RUN_ID` and `eva/` branch conditions still matter. *Verify:* `pnpm --filter @eva/backend test` — `callback-src/tests/turnCheckpoint.test.ts` and `tests/turnCheckpointCompletionContract.test.ts` still pass.
4. **Rebuild the bundle.** `pnpm --filter @eva/backend build:callback`. The sandbox runs `convex/_sandbox_runtime/callbackScript.generated.ts`, written by `scripts/build-callback-script.mjs:50-53`; `callbackScript.ts` is a one-line re-export. **Never hand-edit the generated file** — the next build overwrites it. The build typechecks `callback-src` first and refuses to bundle on failure (`build-callback-script.mjs:17-29`). `predeploy` runs it automatically (`packages/backend/package.json:22`).
5. **Deploy.** `pnpm --filter @eva/backend deploy` (`convex deploy`). Existing sandboxes keep the old bundle until they restart; test on a fresh sandbox.

## Verification

- `pnpm --filter @eva/backend typecheck`, `pnpm --filter @eva/backend typecheck:callback`.
- `pnpm --filter @eva/backend test`. The tests that pin this behaviour:
  - `callback-src/tests/turnCheckpoint.test.ts:118` asserts task and project chat turns **are** stamped (it previously asserted the opposite), and `:137` asserts `docId`/`reportId`/`automationRunId` are still skipped. `:152` still covers the `eva/` branch condition.
  - `tests/turnCheckpointCompletionContract.test.ts:62-69` pins the four `args.<name> =` assignments; `:82-102` pins that every sandbox-facing completion receiver spreads `turnCheckpointArgs` and does not redeclare `beforeSha:`.
  - `tests/scopeCheckHunks.test.ts`, `tests/scopeCheckVerdict.test.ts`, `tests/scopeCheckDescribe.test.ts`, `tests/prScopeSection.test.ts` (including that the two PR blocks do not clobber each other), `callback-src/tests/blockingQuestionsGate.test.ts`. Web: `apps/web/src/lib/components/chat/_components/scopeCheckSummary.test.ts`.
- **In a real chat:** open a quick task's sandbox chat, ask for one small change, and add an obviously unrelated edit to the prompt. The turn completes, then a few seconds later a chip appears under the reply. Confirm `beforeSha`/`afterSha` landed on the assistant `messages` row first — no shas means the sandbox is running an old bundle.
- **Force a check on one message:** `cd packages/backend && npx convex run scopeCheck:evaluateTurn '{"messageId":"…","attempt":1}'` (add `--prod` for production). This is how the feature was validated originally. `getTurnContext` returns null when `scopeCheck` is already set (`_scopeCheck/queries.ts:60`), so a re-run is a no-op unless the field is cleared first — and also returns null when either sha is missing (`:63`), the shas are equal (`:64`), the repo does not resolve (`:67`), or no non-system user message precedes the reply (`:69-81`).

## Risks and rollback

- **Cost.** One Jev call per judged hunk (carrying three questions), one headline call, and one mention call per flagged hunk. Hunks are capped at `MAX_JUDGED_HUNKS = 60` (`_scopeCheck/verdict.ts`), run six at a time, each clipped to 3,000 characters (`hunks.ts:57`); the headline diff is clipped to 30,000 characters and the prompt to 8,000. Flagged hunks are capped at `MAX_FLAGGED_HUNKS = 20` and the reply at `MAX_REPLY_CHARS = 4,000` (`describe.ts`). Worst case is 81 calls per turn, but the mention pass scales with what the chip will show — normally 0–3 — not with the diff. Three surfaces now judge rather than one, so watch the `eva-scope-check` tag (`scopeCheck.ts:36`) — task and project chat traffic is the bulk of the increase.
- **Latency, not blocking.** Judging is scheduled, never inline (`_scopeCheck/mutations.ts:25-30`), and retries up to three times at 30 s when GitHub has not caught up with the push (`scopeCheck.ts:39-41`, `:62-72`).
- **Rollback is slower than it used to be.** Turning a surface off means re-tightening `CHECKPOINTED_ENTITY_ID_FIELDS` (`turnCheckpoint.ts:63`) **and** rebuilding the bundle — not a Convex-only revert. Running sandboxes keep their bundle until they restart, so the change lands gradually rather than at deploy. To stop verdicts immediately, revert the Convex side instead: drop `extraPatch` from `saveResult`, which takes effect on the next deploy.
- **Failing open.** Everything downstream tolerates missing shas: no shas means no scheduling, and `scopeCheck` stays absent. No migration, no cleanup — existing verdicts remain valid and keep rendering.

## Out of scope: quick-task runs

A quick task's **run** (the initial autonomous execution, not its chat) cannot use this design.

- `appendTurnCheckpoint` bails on `RUN_ID` (`turnCheckpoint.ts:96`).
- `persistTurnWork` skips committing and pushing for runs entirely (`callback-src/runtime/turnPersist.ts:160`, `REQUIRE_TASK_COMMIT || RUN_ID`), because the run workflow owns commit, push and PR semantics — the commit gate must keep failing agents that did not commit (`turnPersist.ts:153-156`).

So a run has no turn diff to judge. Covering runs would mean judging the **PR diff** (`_github/prDiff.ts:74` `fetchPrDiff`) against the **task description** rather than a turn diff against a prompt: a different unit of work, a different question, and a different point in the lifecycle. That is a new design, not an extension of this one.

## Open questions

- **Calibration.** `FLAG_THRESHOLD = 0.5`, `MENTION_THRESHOLD = 0.5` (`verdict.ts`) and the UI's `SCOPE_REVIEW_THRESHOLD` / `SCOPE_FLAGGED_THRESHOLD` (`apps/web/src/lib/components/chat/_components/scopeCheckSummary.ts:13-15`) were set on session traffic and have not been re-tuned. Task and project chat prompts are shorter and more mechanical, so the same threshold may flag more routine turns. Now that those surfaces are live, check the false-positive rate on real traffic before trusting the chip's number there. `MENTION_THRESHOLD` is newer still and untuned: a reply that gestures at a change without naming it is the judgement call to watch.
- **Task runs.** See above — decide whether the PR-diff-versus-description question is worth building at all.
