# Move quick-task runs and one-shot agents onto the durable `turns` table (durable-turns Phases 6–7)

Status: implemented in two pull requests, not yet deployed. Written 2026-10-07. Follows `internal/plans/implemented/chat-turns-on-durable-turns-table.md` (Phases 0–5).

- **PR A (#914):** Phase 6.0–6.3 and Phase 7.0–7.2. Every new run and one-shot agent runs on a turn, and the lease is its stall check. Work in flight at deploy keeps its old path.
- **PR B (stacked on A):** Phase 6.4, Phase 7.3, the session legacy branches and the old heartbeat path. Merge it only after the deploy check below.

See "Implementation (2026-10-07)" for what changed from the phase text.

## Goal

Quick-task and project-task runs (`agentRuns`, `taskExecutionWorkflow`) use the same turn model as the three chats: a `turns` row with a lease, a generation fence and the reconcile cron.

**Why:**

- A run has its own stall system: `_taskWorkflow/watchdog.ts:checkStaleRuns`, a 30 s self-rescheduling chain per run, plus `livenessProbe.ts:probeStaleRunLiveness`.
- The run has no generation fence. Only `handleCompletion`'s "latest running run" check protects it from an old callback.
- The run extends its sandbox deadline from the watchdog chain, not from the agent's own heartbeat.
- The chats already moved. The run chain is the last per-entity stall chain that reads `streamingActivity.lastUpdatedAt`.

**Also in scope (Phase 7, owner decision 2026-10-07):** the seven other one-shot agents move onto turns too, so every sandbox agent has one stall model and the old heartbeat path can be deleted.

## Current state

**Already generic.** These work for a run turn without change (pinned by the Phase 6.0 tests):

- `renewTurnLease`, the generation fence, `graceExpiredTurnLease`, `turns.reconcile` / `listExpired` / `graceExpired`;
- `turns.markLaunching` and `turns.acquireOneShotLease`;
- `launchOnExistingSandbox` already sets `TURN_ID` / `TURN_LEASE_GENERATION` when the caller passes `turnId` / `turnLeaseGeneration`;
- the callback already heartbeats with the lease when it has one, and exits on a terminal lease. `persistTurnWork` skips task runs, so a run exit commits nothing;
- `applyLegacyHeartbeat` now maps `task-run-<runId>` to the run, so an open run turn blocks unfenced writes to its stream.

**Run-specific.** These must change:

- **Start:** seven sites call `workflow.start(taskExecutionWorkflow)` and patch `task.activeWorkflowId` by hand: `_agentTasks/execution.ts`, `_taskWorkflow/scheduling.ts`, `_taskWorkflow/publicMutations.ts`, `buildWorkflow.ts`, `_projects/sandbox.ts`, `evaluationReports.ts`, `_automations/findings.ts`. There is no shared helper.
- **`openTurn`** requires `placeholderMessageId` and `prompt`. A run has no placeholder message. The schema fields are already optional.
- **Stall check:** `updateRunToRunning` schedules `checkStaleRuns` after 90 s (`STALE_CHECK_DELAY_MS`) and the 2-hour `handleStaleRun`.
- **Deadline:** `checkStaleRuns` extends the sandbox deadline by 60 s every 30 s while the run is fresh. That includes the post-agent steps (push, PR, deployment tracking), because `finalizingAt` counts as activity.
- **Completion:** `taskWorkflow:handleCompletion` (callback `completionMutation`, keyed by `RUN_ID`) sets `finalizingAt` and sends `taskCompleteEvent`.
- **`closeTurn`** touches idle-pause activity through `activityRefForParentId`, which returns null for a run id.

**Thresholds today against the lease:**

| Phase                                     | Run watchdog today                       | Lease                                                           |
| ----------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| Startup (no sandbox, or startup activity) | 15 min (`STALE_NO_SANDBOX_THRESHOLD_MS`) | 15 min (`TURN_STARTUP_LEASE_MS`)                                |
| Agent running                             | 5 min, then probe                        | 2 min, then probe                                               |
| Process alive but silent                  | kept alive until the 2-hour backstop     | grace for 10 min (`TURN_SILENT_ALIVE_GRACE_MS`), then finalised |
| Finalizing (after `handleCompletion`)     | 10 min (`STALE_FINISHING_THRESHOLD_MS`)  | 10 min (`TURN_FINALIZING_LEASE_MS`)                             |
| Provider unreachable                      | kill at 25 min                           | grace for 10 min, then finalised                                |

## Phases

Ship each phase on its own. Each phase ends in a state you can check.

### Phase 6.0: groundwork (no behaviour change) — done 2026-10-07

1. **Schema:** `turnFields.entityId` is `turnEntityIdValidator`: the three chat ids plus `v.id("agentRuns")`. `chatTurnEntityIdValidator` stays three-way for `getChatStatus`.
2. **Types:** `turnStore.TurnEntityId` is every owner. `ChatTurnEntityId` excludes runs. `findOpenTurn`, `resolveCompletionTurn`, `closeOpenTurn` and `closeTurnForWorkflow` take any owner. `openTurn` still takes chat owners only.
3. **Adapter:** `runTurnAdapter` in `_chat/surfaceAdapters.ts` (`parseId`, `streamingEntityId = getTaskRunStreamingEntityId`, `parseStreamingEntityId`). It is not a `ChatSurfaceAdapter`: a run has no placeholder, queue or synthetic turn.
   - `chatAdapterForEntity` is now `turnAdapterForEntity(db, entityId, { chat, run })`.
   - `chatEntityIdFromStream` is now `turnEntityIdFromStream`, and it maps `task-run-<runId>`.
4. **Reconciler:** `turns.finalizeExpired` sends a run turn to `finalizeExpiredRunTurn`. For now it only closes the turn (`error`) and logs. `checkStaleRuns` still owns the run.
5. **Completion:** `taskWorkflow:handleCompletion` accepts optional `turnId` / `leaseGeneration` (`turnLeaseFenceArgs`) and ignores them.

**Check:** deploy. No run opens a turn, so nothing changes. Tests: `turnLifecycleIntegration.test.ts` ("quick-task run as a turn owner"), `chatCompletionFenceArgs.test.ts` (run fence).

**Why first:** Phase 6.1 callbacks send fenced completions and fenced heartbeats on `task-run-…`. The validator and the reconciler must know runs before any run turn exists.

### Phase 6.1: one start helper (refactor, no behaviour change)

1. Add `startTaskRunWorkflow(ctx, args)` in `_taskWorkflow/`. It starts `taskExecutionWorkflow` and patches `task.activeWorkflowId`.
2. Move all seven start sites onto it. Keep each site's own error handling (`_projects/sandbox.ts` and `_agentTasks/execution.ts` roll back on a failed start).

**Check:** typecheck; existing task-run tests. A contract test fails if a file outside the helper calls `workflow.start(…taskExecutionWorkflow…)`.

**Why:** Phase 6.2 must open a turn at every start. One helper means one place, and no start site can be missed.

### Phase 6.2: open durable turns for new runs (both stall systems run)

**Store:**

- Make `placeholderMessageId` and `prompt` optional in `OpenTurnFields`. Widen `openTurn` to `TurnEntityId`.
- `closeTurn`: map a run id to its task's activity ref (kind `task`), so the idle-pause sweep learns "the agent finished". Add the mapping to `runTurnAdapter`, not to `activityRefForParentId`.

**Start** (`startTaskRunWorkflow`):

1. `openTurn({ entityId: runId, streamingEntityId: getTaskRunStreamingEntityId(runId), model, repoId })`.
2. Start the workflow with `turnId` as a new **optional** argument.
3. `bindTurnWorkflow` after `workflow.start`.

**Workflow** (`taskExecutionWorkflow`):

- Run the new steps only when `args.turnId !== undefined`. This keeps in-flight journals replayable, the same method as chat Phase 2.
- Do not reorder existing steps, and do not change the arguments of existing steps.
- New steps:
  1. `turns.markLaunching` after `prepareSandboxSteps`.
  2. `turns.acquireOneShotLease` before `launchOnExistingSandbox`, then pass `turnId` / `turnLeaseGeneration` to it. A null lease (the turn closed during startup) records the run as an error and skips the launch.
  3. In `finally`, close the run turn after `clearActiveWorkflow`: `done` on success, `error` otherwise. A new step, gated on `args.turnId`.

**Completion** (`taskWorkflow:handleCompletion`):

- After the existing run checks, call `resolveCompletionTurn({ entityId: runId, turnId, leaseGeneration })`.
- `stale`: ignore the callback, as for any other stale completion.
- `current`: `advanceTurn(…, "finalizing")`, then schedule `extendSandboxDeadline` for `2 × TURN_FINALIZING_LEASE_MS`. Push, PR and deployment tracking run after the agent exits, and no heartbeat renews the lease then.
- `legacy`: unchanged (runs started before this phase).

**Exits that must close the turn:**

- `cancelExecution`: `closeTurnForWorkflow(runId, workflowId, "cancelled")`.
- `cleanUpStaleRun` (watchdog kill): `closeOpenTurn(runId, "error")`, so the two stall systems cannot both act on one run.
- `handleStaleRun` (2-hour backstop): the same.

**Stall checks:** unchanged. `checkStaleRuns` stays the authority. The reconciler's run branch still only closes the turn. The callback exits on that terminal lease, and `checkStaleRuns` then sees a dead process. This is the same parallel state as chat Phase 2.

**Check (production):**

- Start a quick task and a project task. Confirm a `turns` row for the run goes `staged → launching → running → finalizing → done`, with lease generation 1.
- Confirm the callback heartbeats with `turnId` (the `task-run-…` row updates and `leaseExpiresAt` moves).
- Kill the agent process mid-run. Confirm both systems act once: the turn closes and the run ends `error` with one alert.
- Confirm no run turn stays open after its run ends.

### Phase 6.3: the lease becomes the stall authority

1. **Reconciler:** `finalizeExpiredRunTurn` calls `cleanUpStaleRun`, then closes the turn. It keeps today's error texts and `exitReason` values (see Decision 3):

   | Turn state and cause                     | Error text                                                         | `exitReason`                  |
   | ---------------------------------------- | ------------------------------------------------------------------ | ----------------------------- |
   | `staged` / `launching`, no `sandboxId`   | Run killed by watchdog: sandbox was never attached                 | `watchdog_no_sandbox`         |
   | `staged` / `launching`, with `sandboxId` | Run killed by watchdog: sandbox startup stalled                    | `watchdog_startup_stalled`    |
   | `running`                                | Run killed by watchdog: no heartbeat for Ns                        | `watchdog_killed`             |
   | `finalizing`                             | Run killed by watchdog: finalization stalled (no heartbeat for Ns) | `watchdog_finalizing_stalled` |
   | any, `silent_timeout`                    | as the state row, plus the reconciler's silent-cause detail        | as the state row              |

   Read the task and run inside the mutation. Skip `cleanUpStaleRun` when the run is no longer `queued` / `running`.

2. **Stop the old chain:** `updateRunToRunning` reads `findOpenTurn(runId)`. When a turn owns the run, it does not schedule `checkStaleRuns`. It keeps the 2-hour `handleStaleRun`. No argument change, so the step journal is unchanged (same method as chat Phase 3 `armLegacyStallCheck`).
3. **Deadline:** `renewTurnLease` already extends the sandbox deadline on a written renewal (at most once per half lease, for `2 × lease`). Phase 6.2 added the finalizing extension. Nothing else is needed.
4. **Recovery:** `cleanUpStaleRun` stays the one stop path. It stops the quick-task sandbox (with diagnostics), marks the run `error`, and schedules `maybeScheduleQuickTaskRetry` after 20–40 s (`buildQuickTaskRetryDelayMs`). The once-only rule (`auto_retry_scheduled` on the previous run) does not change.
5. **Workflow tracking lost:** no separate check. A workflow that dies without closing its turn stops renewing, so the lease expires and the reconciler finalises the run.

**Check:**

- Kill the callback mid-run. The reconciler finalises within about 2 min plus the probe, not 5 min.
- Freeze the callback (`kill -STOP`). The run is finalised after the 10-minute grace, with the silent-cause detail.
- A network-like failure still schedules exactly one retry 20–40 s later.
- `turnDeadlineExtensionContract.test.ts` covers the run renewal and the finalizing extension.

### Phase 6.4: cleanup

Do this at least 2 h plus one release after Phase 6.3, or after a production check finds no run in flight without a turn (the chat Phase 5 rule).

**Delete:**

- `checkStaleRuns` and `probeStaleRunLiveness`. Leave no-op stubs with the same argument validators for one release, because scheduled jobs call them.
- `finalizeExpiredRunTurn`'s close-only body (replaced in 6.3).
- Staleness helpers with no caller left: `isSandboxStartupActivity`, `isFinalizingActivity`, `hasActiveAgentToolStep`, `staleProbeFollowUp`, `STALE_*` constants, and `staleTurnDecision` (already test-only today). Check each with `knip` first; the chats may still import some.
- The `legacy` branch of the run's `resolveCompletionTurn` result.

**Then:**

- Make `turnId` required on `taskExecutionWorkflow`. Pin the new journal in `turnLifecycleContract.test.ts`.

**Keep:**

- `handleStaleRun` (2-hour backstop).
- `cleanUpStaleRun` and `maybeScheduleQuickTaskRetry`.
- `handleCompletion`'s latest-running-run check. It costs little and also guards a rival run of the same task.

### Phase 7: one-shot agents on durable turns

Every sandbox agent that `launchOnExistingSandbox` starts opens a turn. Today these agents have only the 2-hour `handleStale*` backstop; nothing reads their heartbeat age.

| Agent                      | Workflow                      | Turn owner (`entityId`) | `lane`      | Stall teardown today    |
| -------------------------- | ----------------------------- | ----------------------- | ----------- | ----------------------- |
| Automations                | `automationWorkflow.ts`       | `automationRuns` id     | —           | none (add one)          |
| PR recap                   | `prRecapWorkflow.ts`          | `docs` id               | —           | none (add one)          |
| Doc interview and generate | `docInterviewWorkflow.ts`     | `docs` id               | —           | `handleStaleDoc`        |
| Test generation            | `testGenWorkflow.ts`          | `docs` id               | —           | `handleStaleDoc`        |
| Evaluation and eval-fix    | `evaluationWorkflow.ts`       | `evaluationReports` id  | —           | `handleStaleEvaluation` |
| Session summarize          | `summarizeWorkflow.ts`        | `sessions` id           | `summary`   | `handleStaleSession`    |
| Project interview and spec | `projectInterviewWorkflow.ts` | `projects` id           | `interview` | `handleStaleProject`    |

**Why a lane (Decision 6):** summarize and project interview/spec run against a session or project row that already owns chat turns. Under one key, `getChatStatus` would show "Working…" during a summary, and `openTurn` for a chat would supersede (cancel) the summary turn. The lane keeps the two apart. Chat turns leave it unset.

#### Phase 7.0: groundwork (no behaviour change)

1. **Schema:**
   - Add `v.id("automationRuns")`, `v.id("docs")` and `v.id("evaluationReports")` to `turnEntityIdValidator`.
   - Add `lane: v.optional(v.union(v.literal("summary"), v.literal("interview")))` to `turnFields`.
   - Change `by_entity_open` to `["entityId", "lane", "open"]`. Chat readers (`findOpenTurn`, `hasOpenChatTurn`) query `lane === undefined`. A new `findOpenLaneTurn(entityId, lane)` serves the one-shots.
   - `turnProjection.openChatEntityIdsForRepo` and `sandboxIdlePause` keep counting lane turns as "sandbox busy". Only chat UI status ignores them.
2. **Adapter:** one `oneShotTurnAdapter` per owner (table plus lane): `parseId`, `streamingEntityId`, `parseStreamingEntityId` (`automation-run-`, `pr-recap:`, `summary:`, raw doc / report / project id), and `finalizeExpired`, which calls that agent's existing stall teardown. `turnAdapterForEntity` gains a `oneShot` handler and also receives `turn.lane`.
   - Raw doc, report and project stream ids cannot tell the agent apart by prefix. The adapter maps a stream id to an owner only through the open turn (`by_entity_open`), not by parsing.
3. **Completion:** add `turnLeaseFenceArgs` to every one-shot `handleCompletion` and ignore the values (the Phase 6.0 / chat Phase 1 rule).
4. Centralise the stream-id strings that are inline today (`automation-run-`, `pr-recap:`, `summary:`) next to the other prefixes.

#### Phase 7.1: open turns for one-shot agents (both systems run)

The same method as Phase 6.2, per workflow:

- Open the turn at the start site, start the workflow with an optional `turnId`, bind the workflow.
- Gated steps: `markLaunching` after sandbox preparation; `acquireOneShotLease` before each `launchOnExistingSandbox`; pass `turnId` / `turnLeaseGeneration`.
- Workflows with two launches (doc interview then generate, evaluation then eval-fix, interview then spec) open one turn per launch. They close the first before they open the next.
- `handleCompletion` resolves the fence (`stale` → ignore; `current` → `finalizing`).
- Close the turn in the workflow's `finally` and in every cancel and backstop path.
- The reconciler still only closes one-shot turns. The 2-hour backstops stay.

#### Phase 7.2: the lease becomes the stall authority

- `finalizeExpired` calls each adapter's `finalizeExpired` (the existing teardown), then closes the turn.
- Add the missing teardowns for automations and PR recap: mark the run or doc failed, clear the workflow pointer, clear the stream row.

#### Phase 7.3: cleanup

- Make `turnId` required on every one-shot workflow (after the drain rule).
- Delete the old heartbeat path (below).

### Deleting the old heartbeat path

`turns.legacyHeartbeat`, `turns.legacyHeartbeatFromCallback` and the no-`turnId` branch of `http.ts` `/api/streaming/heartbeat` write only `streamingActivity` (no lease, no deadline). After Phases 6 and 7, these senders are left:

- Session one-shot workflows without `turnId`, and session claims of a `pendingTurn` without `turnId` (`_sessions/workflow.ts`). Make `turnId` required there, as task and project chats did in chat Phase 5.
- The Cursor turn worker under a legacy claim (`callback-src/providers/cursorSdkDaemon.ts`). It goes with the session legacy claim.

**Delete, in order, after Phase 7.3 and the session clean-up:**

1. Server: `legacyHeartbeat`, `legacyHeartbeatFromCallback`, `applyLegacyHeartbeat`, and the `http.ts` no-`turnId` branch (answer `terminal: unknown_turn`).
2. Server: the raw-`entityId` HMAC fallback in `http.ts`.
3. Callback: the lease-less senders (`identity === null` fallbacks in `http/convexClient.ts`), legacy claim parsing in `claimedTurnLifecycle.ts`, and the Cursor legacy worker.
4. Tests: the legacy cases in `turnLifecycleIntegration.test.ts` and `turnLifecycleContract.test.ts`.

`sandboxIdlePause` keeps reading `streamingActivity` freshness. Fenced heartbeats still write that row.

## Implementation (2026-10-07)

The owner asked for every phase at once, in two deploys (Decision 8). The phase text above is the design; these notes record where the code differs.

**PR A: every new run and one-shot agent on a turn.**

- Phases 6.1–6.3 shipped together. There is no parallel phase: a run started after the deploy is watched by its lease only. `updateRunToRunning` arms `checkStaleRuns` only when the run has no open turn, so runs in flight at the deploy keep the old chain.
- `startTaskRunWorkflow` (`_taskWorkflow/startRun.ts`) is the one start path for the seven start sites. It opens the run turn, starts the workflow with `turnId`, binds the turn and records `task.activeWorkflowId`.
- Run stop: `finalizeExpiredAgentTurn` → `finalizeStalledRun` → `cleanUpStaleRun`, with the old texts (`stalledRunStop`). `cleanUpStaleRun` now closes the run turn, so every stop path (old chain, lease, 2-hour backstop, cancel) leaves no open turn.
- One-shot agents open their turn at launch, not at workflow start: `launchAgentStep` → `sandbox.launchAgentTurn` opens the turn already leased, binds the calling workflow and launches with the lease. A launch that throws closes the turn. Sandbox preparation before the launch stays on the 2-hour backstop, as before.
- The gate for in-flight one-shot workflows is a new optional `durableTurns` argument, set by all 11 start sites. Replay compares step name and arguments (`Journal entry mismatch`), so the old `launchOnExistingSandbox` step stays for workflows without it.
- One-shot completions run `settleAgentTurnCompletion` first: a stale fence is dropped, a current turn closes `done` / `error`. The workflow's own steps after the agent (PR recap upsert, automation PR) are on the 2-hour backstop, as before.
- One-shot stall teardown reuses the backstop code, now extracted as `tearDownStale{Session,Doc,Project,Evaluation}Workflow` (`workflowWatchdog.ts`). Automations had no teardown; `tearDownStaleAutomationRun` (`_automations/runs.ts`) marks the run failed and deletes its ephemeral sandbox.
- Owner dispatch: `turnAdapterForEntity(db, turn, { chat, agent })`. `AgentTurnOwner` covers `run`, `automation`, `doc`, `evaluation`, `summary` (session lane) and `interview` (project lane).
- `turns.lane` and `by_entity_open: ["entityId", "lane", "open"]`. Chat readers query lane unset; `openChatEntityIdsForRepo` skips lane turns.
- `turnOwnerFromStream` maps every agent stream id to its owner, so the old heartbeat gate also covers agent turns while PR B is pending. It checks agent prefixes before chat ids.
- Stream-id prefixes live in `_chat/agentStreamIds.ts`. `getTaskRunStreamingEntityId` uses `TASK_RUN_STREAM_PREFIX`; the web drift test pins both.
- `closeTurn` re-reads the turn, so a second close in one mutation is a no-op. A closed run turn touches its task's idle-pause activity.

**PR B: clean-up.**

- `taskExecutionWorkflow.turnId` is required; the gated steps are unconditional. A run completion without a current lease is ignored.
- `checkStaleRuns` and `probeStaleRunLiveness` are no-op stubs for one release. The backend staleness helpers are deleted (the web keeps its own copy in `@eva/shared`); `staleness.ts` keeps only `RUN_TIMEOUT_MS`.
- `durableTurns` is gone: every one-shot agent launches under a turn. A one-shot completion without a current lease is dropped.
- Sessions: `sessionExecuteWorkflow.turnId` and `saveResult.turnId` are required. A claim of a staged prompt without a turn id drops it. `ensurePendingTurn` and `restageOpenTurn` restage only for an open turn. The session journal is unchanged for workflows with a turn and is pinned in `turnLifecycleContract.test.ts`.
- Old heartbeat path deleted: `turns.legacyHeartbeat`, `legacyHeartbeatFromCallback`, `applyLegacyHeartbeat`, `turnOwnerFromStream`, and the raw-`entityId` HMAC fallback. `/api/streaming/heartbeat` answers a heartbeat without `turnId` with `terminal: unknown_turn`.
- Callback: a claim without a lease is no claim; turn ownership always carries a lease; a process with no lease sends no heartbeat; the Cursor worker and synthetic turns require a lease. The empty claim keeps its `legacy` tag so every daemon bundle parses it.

### Deploy steps

1. Deploy PR A.
2. Wait at least 2 hours plus one release, or run this production check (paged reads):
   - `agentRuns` with status `queued` or `running` and no open `turns` row for the run id: must be 0.
   - Open one-shot workflows without a turn: `docs`, `projects`, `evaluationReports`, `automationRuns` and `sessions` (summary) whose `activeWorkflowId` is set and that have no open turn row: must be 0.
   - `sessions` / `sessionDaemonStates` with a `pendingTurn` that has no `turnId`: must be 0.
3. Merge and deploy PR B.
4. On or after one release after PR B: delete the `checkStaleRuns` and `probeStaleRunLiveness` stubs. On or after 2026-10-14: delete the chat stubs (chat plan follow-up 1).

## Risks

| Risk                                                               | Control                                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runs in flight at deploy have no `turns` row                       | Phase 6.2 opens rows only for new starts. The run keeps the old chain until it ends                                                                                |
| Workflow replay breaks                                             | Optional `turnId`, gated new steps, no reordering, no argument change to existing steps. Extend `turnLifecycleContract.test.ts` to pin the pre-cutover run journal |
| An old callback bundle has no lease support                        | Each run launches a fresh callback (`KILL_PRIOR_AGENT_PROCESSES_CMD`), so every run after the deploy has the current bundle                                        |
| A start site misses the turn                                       | Phase 6.1 moves every start to one helper, pinned by a contract test                                                                                               |
| The lease kills a frozen-but-alive run earlier than today          | Decision 2                                                                                                                                                         |
| Post-agent steps (push, PR) outlive the 10-minute finalizing lease | Same limit as today (`STALE_FINISHING_THRESHOLD_MS`). The finalizing deadline extension keeps the sandbox up for it                                                |
| Reconcile load                                                     | The 25-per-tick batch now also covers runs and one-shot agents. Check it against peak open turns                                                                   |
| A lane turn shows as a chat turn                                   | Chat readers query `lane === undefined`; a contract test pins every `by_entity_open` reader                                                                        |
| Two stall systems act on one run in 6.2                            | Every stop path closes the turn; the reconciler only closes the turn                                                                                               |

## Tests

**Backend (`packages/backend/tests/`):**

- `turnLifecycleIntegration.test.ts`: run turn open, launch, lease, fenced completion, finalise through `cleanUpStaleRun`.
- `turnLifecycleContract.test.ts`: pre-cutover run journal; gated steps.
- `turnDeadlineExtensionContract.test.ts`: run renewal and finalizing extension.
- `chatCompletionFenceArgs.test.ts`: the run completion fence, current and stale.
- A new contract test for the single start helper.
- `sandboxIdlePause.test.ts`: a run turn's close touches task activity.

**Daemon (`callback-src/tests/`):** a run-entity fenced heartbeat and completion payload in `turnLease.test.ts`.

## Decisions (2026-10-07)

1. **The run adapter is not a chat adapter.** A run has no placeholder, queue, synthetic turn or interrupt. Forcing it into `ChatSurfaceAdapter` would need dummy members. The dispatcher takes one handler per owner kind (`{ chat, run }`).
2. **Adopt the chat lease policy for runs.** A process the probe sees alive but silent is finalised after 10 min of grace, not kept to the 2-hour backstop. The callback's 10 s transport ping keeps silent tools alive, so only a frozen callback hits this. This is the chat policy since decision 2 of the chat plan.
3. **Keep the stop texts and `exitReason` values.** `maybeScheduleQuickTaskRetry` retries only when `isDaytonaNetworkIssue(error)` is true. None of today's watchdog texts pass that check, so a stalled run is stopped and not retried today. Phase 6 keeps that. Changing the retry rule is a separate decision.
4. **Gate by the open turn, not a new step argument.** `updateRunToRunning` reads the open turn to decide whether to arm `checkStaleRuns` (the chat Phase 3 method).
5. **Close the run turn at the end of the workflow, not at completion.** Push and PR creation are part of the run. The `finalizing` lease covers them, as `finalizingAt` does today.
6. **Move every one-shot agent onto turns (owner, 2026-10-07).** One stall model for all sandbox agents, and the old heartbeat path can go (Phase 7).
7. **An optional `lane` keeps one-shot turns apart from chat turns on the same row (owner, 2026-10-07).** Rejected: a new table with one row per one-shot job. It needs writes at every start site and adds a table for one field of information. This partly reverses chat decision 5 (no surface label), but only for the two owners that share a row.
8. **All phases now, in two deploys (owner, 2026-10-07).** PR A holds every change that is safe for work in flight. PR B holds the clean-up and merges only after the deploy check. Rejected: one deploy, which fails every run, one-shot agent and legacy session claim in flight at that moment.
