# Move quick-task runs onto the durable `turns` table (durable-turns Phase 6)

Status: todo. Written 2026-10-07. Phase 6.0 (groundwork) done 2026-10-07. Follows `internal/plans/implemented/chat-turns-on-durable-turns-table.md` (Phases 0–5).

## Goal

Quick-task and project-task runs (`agentRuns`, `taskExecutionWorkflow`) use the same turn model as the three chats: a `turns` row with a lease, a generation fence and the reconcile cron.

**Why:**
- A run has its own stall system: `_taskWorkflow/watchdog.ts:checkStaleRuns`, a 30 s self-rescheduling chain per run, plus `livenessProbe.ts:probeStaleRunLiveness`.
- The run has no generation fence. Only `handleCompletion`'s "latest running run" check protects it from an old callback.
- The run extends its sandbox deadline from the watchdog chain, not from the agent's own heartbeat.
- The chats already moved. The run chain is the last per-entity stall chain that reads `streamingActivity.lastUpdatedAt`.

**Out of scope:** the other one-shot agents (automations, PR recap, summarize, doc and project interview, evaluation, test generation). See "Old heartbeat path".

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

| Phase | Run watchdog today | Lease |
|---|---|---|
| Startup (no sandbox, or startup activity) | 15 min (`STALE_NO_SANDBOX_THRESHOLD_MS`) | 15 min (`TURN_STARTUP_LEASE_MS`) |
| Agent running | 5 min, then probe | 2 min, then probe |
| Process alive but silent | kept alive until the 2-hour backstop | grace for 10 min (`TURN_SILENT_ALIVE_GRACE_MS`), then finalised |
| Finalizing (after `handleCompletion`) | 10 min (`STALE_FINISHING_THRESHOLD_MS`) | 10 min (`TURN_FINALIZING_LEASE_MS`) |
| Provider unreachable | kill at 25 min | grace for 10 min, then finalised |

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

   | Turn state and cause | Error text | `exitReason` |
   |---|---|---|
   | `staged` / `launching`, no `sandboxId` | Run killed by watchdog: sandbox was never attached | `watchdog_no_sandbox` |
   | `staged` / `launching`, with `sandboxId` | Run killed by watchdog: sandbox startup stalled | `watchdog_startup_stalled` |
   | `running` | Run killed by watchdog: no heartbeat for Ns | `watchdog_killed` |
   | `finalizing` | Run killed by watchdog: finalization stalled (no heartbeat for Ns) | `watchdog_finalizing_stalled` |
   | any, `silent_timeout` | as the state row, plus the reconciler's silent-cause detail | as the state row |

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

## Old heartbeat path after Phase 6

`turns.legacyHeartbeat`, `turns.legacyHeartbeatFromCallback` and the no-`turnId` branch of `http.ts` `/api/streaming/heartbeat` **cannot be deleted after Phase 6**. The path writes only `streamingActivity` (no lease, no deadline). Remaining callers:

| Caller | Stream id | Who reads its freshness |
|---|---|---|
| Automations (`automationWorkflow.ts`) | `automation-run-<runId>` | nobody (2-hour backstop only) |
| PR recap (`prRecapWorkflow.ts`) | `pr-recap:<docId>` | nobody |
| Session summarize (`summarizeWorkflow.ts`) | `summary:<sessionId>` | nobody |
| Doc interview and generate (`docInterviewWorkflow.ts`) | raw `docId` | nobody |
| Project interview and spec (`projectInterviewWorkflow.ts`) | raw `projectId` | nobody |
| Evaluation and eval-fix (`evaluationWorkflow.ts`) | raw `reportId` | nobody |
| Test generation (`testGenWorkflow.ts`) | raw `docId` | nobody |
| Session one-shot workflows started before the session cutover, and session claims of a `pendingTurn` without `turnId` | raw `sessionId` | gated by the open turn |
| Cursor turn worker (`callback-src/providers/cursorSdkDaemon.ts`) under a legacy claim | parent stream id | gated |

`sandboxIdlePause` also reads `streamingActivity` freshness (15-minute window) for every row, so these writes keep a sandbox from pausing.

**To delete the path, all of these must also happen:**
1. Move the seven one-shot agents onto turns, or replace their heartbeat with a plain, ungated stream write (see Open question 1).
2. Session: no `pendingTurn` and no in-flight workflow without `turnId` (`_sessions/workflow.ts` claim and one-shot branches). Make `turnId` required there, as task and project chats did in Phase 5.
3. Callback: delete the lease-less senders (`identity === null` fallbacks in `http/convexClient.ts`, legacy claim parsing in `claimedTurnLifecycle.ts`, the Cursor legacy worker), then the raw-`entityId` HMAC fallback in `http.ts`.

## Risks

| Risk | Control |
|---|---|
| Runs in flight at deploy have no `turns` row | Phase 6.2 opens rows only for new starts. The run keeps the old chain until it ends |
| Workflow replay breaks | Optional `turnId`, gated new steps, no reordering, no argument change to existing steps. Extend `turnLifecycleContract.test.ts` to pin the pre-cutover run journal |
| An old callback bundle has no lease support | Each run launches a fresh callback (`KILL_PRIOR_AGENT_PROCESSES_CMD`), so every run after the deploy has the current bundle |
| A start site misses the turn | Phase 6.1 moves every start to one helper, pinned by a contract test |
| The lease kills a frozen-but-alive run earlier than today | Decision 2 |
| Post-agent steps (push, PR) outlive the 10-minute finalizing lease | Same limit as today (`STALE_FINISHING_THRESHOLD_MS`). The finalizing deadline extension keeps the sandbox up for it |
| Reconcile load | The 25-per-tick batch now also covers runs. Check it against peak open turns plus running runs |
| Two stall systems act on one run in 6.2 | Every stop path closes the turn; the reconciler only closes the turn |

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

## Open questions

1. **The seven other one-shot agents.** Option A: move them onto turns too (a later Phase 7). They gain a stall check; today only the 2-hour backstop covers them. Option B: keep their heartbeat as a plain stream write, renamed from "legacy", and delete only the gate. Without one of these, the old path stays.
