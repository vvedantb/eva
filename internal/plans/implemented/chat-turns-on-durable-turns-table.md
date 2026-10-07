# Move task and project chats onto the durable `turns` table

Status: implemented (Phases 0–5). Written 2026-10-06. Phases 0 and 1 done 2026-10-07 (PR #904). Phase 2 done and verified in production 2026-10-07 (PR #906, deployed about 12:23 UTC; task and project chat both passed). Phases 3 and 4 done 2026-10-07 (PR #909, merged 12:54 UTC). Phase 5 done 2026-10-07. Phase 6 is an open, separate project. See "Follow-ups".

## Goal

Task chats and project chats use the same turn model as sessions: a `turns` row with a lease, a generation fence and the reconcile cron.

**Why:**
- Today these chats track a turn with fields on the `agentTasks` / `projects` row.
- They have no generation fence. An old daemon can write into a newer turn.
- Each known race needs a separate patch (`pendingTurnRestage.ts`).
- Stall detection is slower: a 5-minute timer, against a 2-minute lease.
- The task and project UIs ignore synthetic turns (`syntheticTurnMessageId`).

Quick-task autonomous runs (`agentRuns`) are out of scope. See Phase 6.

## Current state

**Already generic.** These work for any surface without change:
- all of `_chat/turnLease.ts`;
- `acquireTurnLease`, `advanceTurn`, `bindTurnWorkflow`, `closeTurn`, `graceExpiredTurnLease`;
- `turns.reconcile`, `listExpired`, `graceExpired`, `heartbeat`, `markLaunching`, `acquireOneShotLease`;
- the `http.ts` heartbeat branch on `turnId`;
- the daemon (`claimedTurnLifecycle.readClaimedTurn`, `readTurnLeaseIdentity`) already accepts a durable claim for any surface;
- `pendingTurnFields.turnId` already exists in the shared `chatDaemonEntityFields`, so no schema change is needed to stage a `turnId` on a task or project.

**Session-only.** These must be generalised:
- **Schema:** `turnFields.surface` is `v.literal("session")`.
- **`_chat/turnStore.ts`:**
  - `findOpenSessionTurn` and `openSessionTurn` (`openSessionTurn` also sets `sessions.turnLifecycleVersion`);
  - `resolveCompletionTurn`, `closeOpenSessionTurn` and `closeTurnForWorkflow`;
  - `renewTurnLease` calls `normalizeId("sessions", …)`.
- **`turns.ts`:**
  - `getSessionStatus`;
  - `applyLegacyHeartbeat` gates on sessions only;
  - `finalizeExpired` hard-codes `sessionChatAdapter`, patches the session and schedules `retryEmptyStalledSessionTurn`.
- **`_chat/turnProjection.ts`:** `openSessionIdsForRepo` reads `by_repo_open` with no surface filter.

**Two blockers before any task or project turn row can exist:**
1. `renewTurnLease` returns `unknown_turn` for a non-session turn. The daemon then exits.
2. Task and project `handleCompletion` reject `turnId` / `leaseGeneration`. The daemon sends both whenever it holds a lease.

## Phases

Ship each phase on its own. Each phase ends in a state you can check.

### Phase 0: generalise the turn store (no behaviour change) — done 2026-10-07

1. **Schema: one chat turn, no surface label.** The `entityId` already identifies the table, so `surface` adds no information.
   - Type `entityId` as `v.union(v.id("sessions"), v.id("agentTasks"), v.id("projects"))`. Today it is `v.string()`, and every existing row holds a session id.
   - Add an index `by_entity_open: ["entityId", "open"]` and stop reading `surface`.
     - **Finding:** `by_entity_open` already existed as `["surface", "entityId", "open"]`. Phase 0 changed it in place to `["entityId", "open"]`. No second index was added, so there is no old index to delete.
   - Make `surface` optional, run a migration that unsets it, then delete the field. Follow the schema-narrowing check.
     - **Finding:** the field delete needs its own deploy after `dataMigrations:clearTurnSurface` has run. `surface` is still optional in the schema. The delete moved to Phase 5.
   - Pick the adapter from the id: `chatAdapterForEntity(ctx, entityId)` tries `ctx.db.normalizeId` on each chat table. The surface adapters already hold all per-table behaviour.
2. **`turnStore.ts`:**
   - Add `findOpenTurn(ctx, entityId)` and `openTurn(ctx, { entityId, … })`.
   - Keep the session functions as thin wrappers.
3. **`renewTurnLease`:** find the current turn with `findOpenTurn(turn.entityId)`, not the sessions lookup.
4. **`resolveCompletionTurn`:** take any chat entity id, not a `sessionId`.
5. **`surfaceAdapters.ts`:**
   - Add `parseId`, `finalizeOrphanTurn`, and an optional `afterStallFinalize` (for the early-stall retry).
   - Export `chatAdapterForEntity(ctx, entityId)`.
6. **`turns.finalizeExpired`:**
   - Dispatch through the adapter.
   - Move the session-only no-workflow branch and the retry into the session adapter.
7. **`applyLegacyHeartbeat`:** map the `task-chat-` / `project-chat-` streaming ids to their entity id, then apply the ownership gate to all three chats.
8. **`turnProjection.openSessionIdsForRepo`:** keep only ids that `ctx.db.normalizeId("sessions", …)` accepts.

**Check:** add a hand-inserted task-chat turn (an `agentTasks` id) to `turnLifecycleIntegration.test.ts`. Test renew, the generation fence, reconcile/finalise through the adapter, and the legacy-heartbeat gate.

### Phase 1: accept fence arguments (compatibility) — done 2026-10-07

1. Add optional `turnId` and `leaseGeneration` to `handleCompletion` and `completeSyntheticTurn` on both surfaces. Ignore the values for now.
2. Widen the `claimPendingTurn` return validator to the session union (`legacy` or `durable`).
3. Add `chatTurnLifecycleVersion: v.optional(v.literal(2))` to the `agentTasks` and `projects` fields. It marks rows that use durable turns, like `sessions.turnLifecycleVersion`.

**Check:** deploy. No behaviour changes.

**Why first:** Phase 2 daemons send fenced completions. Without these arguments, the completion validators throw.

### Phase 2: open durable turns for new chat turns — done and verified 2026-10-07 (PR #906)

**Stage** (`stageAndStartTaskChatTurn`, `stageAndStartProjectChatTurn`):
1. Call `openTurn` with the task or project id, `streamingEntityId: chatStreamEntityId(id)` and the placeholder message id.
2. Write `turnId` into `pendingTurn`.
3. Call `bindTurnWorkflow` after `workflow.start`.
4. Pass `turnId` to the workflow as a new **optional** argument.

**Workflows** (`agentTaskChatExecuteWorkflow`, `projectChatExecuteWorkflow`):
- Run the new steps only when `args.turnId !== undefined`. This keeps the journals of in-flight workflows replayable, the same method `sessionExecuteWorkflow` uses.
- Do not reorder existing steps.
- New steps:
  1. `turns.markLaunching` after sandbox validation.
  2. On the one-shot path: `turns.acquireOneShotLease`, then pass `turnId` / `turnLeaseGeneration` to `launchOnExistingSandbox`.
  3. Pass `turnId` through every `saveResult` call.

**Claim** (`_chat/taskChatDaemon.ts`, `_chat/projectChatDaemon.ts`):
- **`pendingTurn.turnId` set, `args.acceptTurn` present:** call `acquireTurnLease(…, "running")` and return `durable`.
- **`args.acceptTurn` absent (an old daemon):** return an empty claim. Prewarm then kills the old daemon under the claim pause, and the new daemon claims with a lease.
- **The turn is closed or already `running`:** clear `pendingTurn`, the same guard sessions use.

**Completion and cancel:**
- `handleCompletion` calls `resolveCompletionTurn`. On `stale`, it returns; otherwise it calls `advanceTurn(…, "finalizing")`.
- `saveResult` calls `closeTurn(done | error)`.
- `cancelExecution` uses a generic `closeTurnForWorkflow(…, "cancelled")`.

**Synthetic turns:**
- `openSyntheticTurn` opens a turn, takes the lease and returns `{ messageId, turnId, leaseGeneration }`.
- `completeSyntheticTurn` and `handleStaleSyntheticTurn` close it, the same as the session copies.

**Watchdogs:** keep the old `checkStale*ChatHeartbeat` chain armed. Both systems run together until Phase 3.

**Added during implementation:**
- The queue drain (`startNextQueuedTaskChatMessage` / `ProjectChat`) opens a turn too, through `startQueuedEntityChatTurn`.
- `ensurePendingTurn` carries the open turn id and treats a slot for a closed turn as an orphan (`isPendingTurnLive`).
- `finalizeStaleChatTurn` closes the durable turn, so the two stall systems cannot both alert on one turn.

**Check:**
- Run a task chat and a project chat turn in a sandbox.
- Confirm that a `turns` row moves `staged → running → finalizing → done`.
- Kill the daemon mid-turn. Confirm the reconciler closes the turn.

**Production check result (2026-10-07, 12:25 UTC, about 2.5 minutes after the deploy):**
- `turns` rows created after 12:23 UTC: 3. All are session turns (1 `done`, 2 open `running`, no expired lease). No row had an unknown entity table.
- Task-chat turns: 0. Project-chat turns: 0. The newest 1,500 `turns` rows (back to 2026-09-01) hold no task or project row.
- No task in the newest 300 and no project in the newest 200 has `chatTurnLifecycleVersion: 2` or a `pendingTurn.turnId`.
- **Verdict at 12:25 UTC: not proven.** No task or project chat had started a turn yet.

**Re-check (2026-10-07, 12:48 UTC):**
- Task chat: **PASS.** Quick task #496 (evalucom/carepulse-ts) opened a durable turn with a bound workflow at 12:44 UTC, lease generation 1. It closed `done` after 19 s, with no error and no expired lease.
- Project chat at 12:48 UTC: not yet tested (no project-chat turn existed).
- Sessions after the deploy: 6 `done`, 1 open `running`. No row has an unknown entity table.

**Final check (2026-10-07, 12:51 UTC): VERIFIED.**
- Project chat: **PASS.** Project #3 (evalucom/carepulse-ts) opened a durable turn with a bound workflow at 12:49 UTC, lease generation 1. It closed `done` after 54 s, with no error and no expired lease.
- Task chat: **PASS** (quick task #496, above).
- Sessions after the deploy: 8 `done`, 1 open `running`. No row has an unknown entity table.
- The merge gate for Phases 3 and 4 is cleared.

### Phase 3: the lease becomes the stall authority — done 2026-10-07 (PR #909)

1. **`ensurePendingTurn`:** decide with `openTurn.state === "running"`, not `pendingTurnAlreadyClaimed`. Stop writing `pendingTurnClaimedAt`.
2. **Watchdog:** stop arming `checkStale*ChatHeartbeat` for durable turns. Add a `durable` flag to `trackXChatWorkflow`.
3. **Sandbox deadline:** move `extendSandboxDeadline` into the lease path. Either schedule it from `renewTurnLease` (throttled) or sweep open turns in `reconcile`. Update `turnDeadlineExtensionContract.test.ts`.
4. **Two-hour backstop:** keep `handleStale*Chat`. `turnLeaseExpiry` already caps at 2 h, but the backstop costs little.
5. **Early-stall retry (decision 4):** enable `afterStallFinalize` for task and project chats.

**Implementation notes:**
- `ensurePendingTurn` uses `isTurnClaimed(openTurn)` on all three chats. It treats `finalizing` as claimed too: a daemon that already reported its completion has claimed the turn, and a restage there would run the prompt twice.
- No `durable` flag on the trackers. `armLegacyStallCheck` reads the open turn instead: if that turn owns the workflow, the chain is not armed. Callers already bind the turn before they track the workflow. A workflow with no turn (session summarize) keeps the chain.
- The deadline extension rides on the written lease renewal in `renewTurnLease` (at most once per half lease), for `2 × lease` (4 min while running). The old chain keeps its own extension for workflows no turn owns.
- `afterStallFinalize` is now required. Task and project chats schedule `retryEmptyStalledTurn`; it skips when a chat turn, a staged prompt or (tasks) a main run is active. The decision is shared with the session retry (`emptyStallRetryPrompt`).
- `pendingTurnRestage.ts` has no callers now. It stays until Phase 5, as planned.

### Phase 4: frontend and other readers — done 2026-10-07 (PR #909)

1. Add `turns.getChatStatus({ entityId })`, the generic form of `getSessionStatus`. It bridges legacy rows through `chatTurnLifecycleVersion`.
2. Replace the `activeChatWorkflowId` "is executing" checks in:
   - `TaskSandboxChatPanel.tsx` (~240)
   - `ProjectSandboxChatPanel.tsx` (~188)
   - `ProjectDetailClient.tsx` (~575)
   - `TaskFooter.tsx` (~123)
   - `taskAgentActivity.ts`, and its test `taskAgentBeam.test.ts`
3. Update the backend readers:
   - `sandboxIdleStop.ts`
   - `mcp/nodeActions.ts`
   - `turnProjection.taskIsExecuting` and `projectIsExecuting`

   These need the open turns for one repo, split by table. `by_repo_open` gives the set; split it with `normalizeId`.
4. Show synthetic turns in the task and project UIs.

**Implementation notes:**
- `sandboxIdleStop.ts` no longer exists; the reader is `sandboxIdlePause.ts`.
- `getSessionStatus` now delegates to the same reader as `getChatStatus`. The session hooks still call it; Phase 5 can switch them and delete it.
- `_chat/turnProjection.ts`: `openChatEntityIdsForRepo` (one `by_repo_open` read gives every open entity id; ids are unique across tables, so one set serves all three), `hasOpenChatTurn`, `isLegacyChatExecuting`, `chatTurnIsOpen`, and `taskIsExecuting` / `projectIsExecuting` that take the open set.
- Task list rows (`getAllTasks`, `listByProject`) and the MCP slim task list carry a server-side `isExecuting`. The web hook `useChatTurnOpen` reads `getChatStatus` for one entity.
- Synthetic turns: the task and project composers read `getChatStatus`, the same rule as the session composer. No new visuals.
- Not changed: the queue gates in `_queues/helpers.ts` (`hasActiveWorkflow` plus `syntheticTurnMessageId`) and `daemonEntitySnapshot.ts`. They read the workflow pointer, which Phase 5 keeps.

### Phase 5: cleanup — done 2026-10-07

Do this at least 2 h plus one release after Phase 3, so that all workflows started before the change have ended.

**Delete:**
- `_chat/pendingTurnRestage.ts` and its test.
- `turnFields.surface`. `dataMigrations:clearTurnSurface` ran in production on 2026-10-07. Delete the field and the migration, and follow the schema-narrowing check.
- `pendingTurnClaimedAt`. It is in the shared field spread, so this needs a schema-narrowing marker and a `dataMigrations.ts` unset across all three tables.
- The task/project `handleStaleSyntheticTurn` 10-minute timers.
- The `checkStale*ChatHeartbeat` and `probeStale*ChatLiveness` handlers for all three chats (decision 2). Leave no-op stubs for one release, because already-scheduled jobs call them.

**Then:**
- Make `turnId` required on both chat workflows.

**Keep:**
- `_chat/daemonClaimPause.ts`. It matters more with leases.
- The `acceptTurn` gate.
- The drains for `pendingTaskStops`, `cancelRequestedAt` and `usageRefreshRequestedAt`.
- The background-agent queue gate.
- `activeChatWorkflowId` as the workflow pointer. Sessions kept `activeWorkflowId` too.
- `_chat/stallRetry.ts`. Decision 4 extends its retry to all chats, and its alert text is shared.
- `_chat/cancelRace.ts`. Sessions still use it. It could later compare turn ids instead.

**Production check before the change (2026-10-07, 12:55 UTC, about 1 minute after the Phase 3 deploy):**
- Full scan of `agentTasks` (966 rows) and `projects` (13 rows): 0 rows with `activeChatWorkflowId` or `pendingTurn`. So 0 open task or project chats run a workflow without a turn.
- Open `turns` (`by_open_lease`): 3, all sessions. 0 task or project turns open. 0 open turns with an expired lease.
- 0 of the newest 3,000 `turns` rows still hold `surface`.

**Implementation notes:**
- **No time-based merge gate (owner decision, 2026-10-07).** The plan asked for 2 h after Phase 3. The production check found 0 task or project chats in flight, so no workflow without a `turnId` runs. The check is re-run just before merge instead. Scheduled stall-check jobs still reach the no-op stubs.
- `turnId` is required on both chat workflows and their `saveResult`. The step order did not change, so workflows started since Phase 2 replay their journal. `turnLifecycleContract.test.ts` pins that journal now, not the V1 one.
- Task and project claims drop a staged prompt without a turn id; they no longer return a `legacy` claim with a prompt. `ensurePendingTurn` restages only for an open, unclaimed turn and always stages its id.
- Deleted for all three chats: `runStaleChatHeartbeatCheck`, `runStaleChatLivenessProbe`, `armLegacyStallCheck`, and the adapter `scheduleCheck` / `scheduleProbe`. `finalizeStaleChatTurn` stays for the reconciler and the 2-hour backstop.
- No-op stubs with the same argument validators, removable on or after 2026-10-14: `checkStaleSessionHeartbeat`, `probeStaleSessionLiveness`, `checkStaleAgentTaskChatHeartbeat`, `probeStaleAgentTaskChatLiveness`, `checkStaleProjectChatHeartbeat`, `probeStaleProjectChatLiveness`, and the task/project `handleStaleSyntheticTurn` (its timer also re-scheduled itself, so it gets a stub too).
- Session summarize workflows own no turn. They had the old chain; now only the 2-hour backstop covers them.
- `pendingTurnClaimedAt` stays optional in the schema. Migrations: `dataMigrations:clearSessionPendingTurnClaimedAt`, `clearTaskPendingTurnClaimedAt`, `clearProjectPendingTurnClaimedAt`.
- `turnFields.surface` was not deleted here. It moved to the follow-ups.
- Not changed: `getSessionStatus` (still a thin wrapper over `getChatStatus`).

## Follow-ups

1. On or after 2026-10-14 (one more release): delete the no-op stubs listed in the Phase 5 notes.
2. Done 2026-10-07. A paged production read found 0 of 472 sessions, 966 tasks and 13 projects with `pendingTurnClaimedAt`. The field and its three migrations are deleted.
3. Done 2026-10-07. A paged production read found 0 of 1,935 `turns` rows with `surface`. The field and `clearTurnSurface` are deleted.
4. Phases 6–7 (quick-task runs and one-shot agents on durable turns): `internal/plans/implemented/quick-task-runs-on-durable-turns.md`.

### Phase 6 (optional, separate project): quick-task runs

1. Add `v.id("agentRuns")` to the `entityId` union, with `entityId = runId` and `streamingEntityId = getTaskRunStreamingEntityId`.
2. Gate `_taskWorkflow/watchdog.ts:checkStaleRuns` the same way as Phase 3.

`agentRuns` has its own completion path (`RUN_ID`) and its own deadline extension. Plan it on its own.

## Risks

| Risk | Control |
|---|---|
| Turns in flight at deploy have no `turns` row | Phase 2 opens rows only for new stages. The legacy gate rejects writes only while a durable row is open |
| Workflow replay breaks | Optional `turnId` plus gated steps. Extend the "pre-cutover replay keeps the V1 journal" test in `turnLifecycleContract.test.ts` to both chat workflows |
| An old daemon in a warm sandbox has no lease support | The `acceptTurn`-gated empty claim plus a prewarm respawn. Check that prewarm runs on every staging path, including the queue drain |
| Fenced completion rejected | Ship Phase 1 before Phase 2 |
| Heartbeats return `unknown_turn` and daemons exit | Ship Phase 0 before Phase 2 |
| Reconcile load | The reconcile batch (25 per tick) now covers three chat types. Check it against peak open turns |
| Data migration | None for the cutover. One unset for `pendingTurnClaimedAt` at cleanup |

## Tests

**Backend (`packages/backend/tests/`):**
- Add task and project fixtures to `turnLifecycleIntegration.test.ts`.
- Update `turnLifecycleContract.test.ts`, `turnLifecycle.test.ts` and `turnUiProjectionContract.test.ts`.
- Update `chatSurfaceUnificationContract.test.ts` for `chatAdapterForEntity`.
- Update `sessionStallWatchdogContract.test.ts` and `turnDeadlineExtensionContract.test.ts`.
- Update `daemonClaimAcceptTurn.test.ts` (durable or empty claim, decided by `acceptTurn`) and `daemonClaimPauseContract.test.ts`.
- Update `pendingTurnRecovery.test.ts`, `cancelRace.test.ts` and `stallRetry.test.ts`.
- Delete `pendingTurnRestage.test.ts` in Phase 5.

**Daemon:**
- Add a task-entity durable claim and completion payload to `callback-src/tests/turnLease.test.ts` and `claimedTurnLifecycle.test.ts`.

**Frontend:**
- `taskAgentBeam.test.ts`.

**CI:**
- `scripts/check-schema-narrowing.test.mjs`.

## Decisions (2026-10-06)

1. **Old daemons without `acceptTurn`:** return an empty claim; prewarm restarts the daemon (Phase 2).
2. **Retire the old heartbeat chain for sessions too.** In Phase 3, stop arming it for sessions as well. In Phase 5, delete `runStaleChatHeartbeatCheck`, `runStaleChatLivenessProbe` and the `checkStale*ChatHeartbeat` handlers for all three chats, behind one release of no-op stubs. The lease reconcile is the only stall authority.
3. **One "sandbox busy" projection** covers a task's main run (`activeWorkflowId`) and its chat turn (Phase 4). The queue already treats them as exclusive.
4. **Extend the early-stall retry to all chats.** Move `retryEmptyStalledSessionTurn` behind the adapter hook `afterStallFinalize`, and enable it for task and project chats (Phase 3).
5. **One chat turn type, no surface label.** The table comes from the `entityId` (see Phase 0). This also means Phase 6 only adds `v.id("agentRuns")` to the union.
