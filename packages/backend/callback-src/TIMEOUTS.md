# Callback timeout policy

Environment variables control watchdog and HTTP behavior for the sandbox callback script (`callback-src/`).

## Agent stream / lifecycle

Every provider runs through its SDK. Cursor's warm daemon supervises one
disposable child Node process per claimed turn; the child resumes the persisted
Cursor agent store but releases its entire SDK heap when the turn ends. Claude,
Codex, and OpenCode keep their provider-specific warm runtimes. `runCliAttempt`
and its subprocess watchdog (the zombie / first-event / first-assistant guards
and `CLAUDE_STREAM_SILENCE_TIMEOUT_MS`) were deleted once OpenCode moved to its
SDK. Each SDK runner owns an inline `setInterval` enforcing max runtime plus a
no-event silence kill at `CLAUDE_NO_OUTPUT_TIMEOUT_MS × 5`, exempting in-flight
tools. Cursor uses that same ×5 budget for the first visible event (not a
shorter 60s window): a resumed agent that is thinking or compacting must not
be mistaken for a hang and replaced. A stall retries the saved agent once;
a second stall fails the turn. Only `agent_not_found` may mint a new agent.

`CLAUDE_FIRST_EVENT_TIMEOUT_MS` and `CLAUDE_FIRST_ASSISTANT_EVENT_TIMEOUT_MS`
no longer gate a kill; they survive only as the durations quoted in
`completion.ts` failure messages.

| Variable                                  | Default | Purpose                                                    |
| ----------------------------------------- | ------- | ---------------------------------------------------------- |
| `CLAUDE_NO_OUTPUT_TIMEOUT_MS`             | 60000   | SDK-runner silence watchdog base (×5 in every runner).     |
| `CLAUDE_FIRST_EVENT_TIMEOUT_MS`           | 90000   | Quoted in the no-first-event failure message.              |
| `CLAUDE_FIRST_ASSISTANT_EVENT_TIMEOUT_MS` | 120000  | Quoted in the no-assistant-event failure message.          |
| `CLAUDE_MAX_TOTAL_RUNTIME_MS`             | 5400000 | Absolute callback runtime cap (~90 min).                   |

Watchdog interval: `NO_OUTPUT_CHECK_INTERVAL_MS` = 5000 (fixed in `config.ts`).

Daemon claim poll (`claudeSdkDaemon.ts`, fixed constants): 50ms while a turn is in flight or within 30s of the last activity, backing off to 1000ms when idle. The 50ms mid-turn cadence is what keeps cancel/stop-task drains prompt; the idle backoff caps an idle daemon at ~1 mutation/s instead of ~20/s.

While a tool is in flight, idle checks are skipped — a tool call emits nothing between its start and its result, so silence there means work, not a hang. Only max runtime applies until the result lands. There is no per-tool stall kill.

OpenCode adds one more timer of its own: after 60 s without events it polls the opencode server's session status, and two consecutive idle answers end the turn. This recovers turns whose SSE connection was dropped by undici's 300 s body timeout during a long silent tool, where the reconnect misses the events that would have ended the turn.

## Convex HTTP

| Variable                                   | Default | Purpose                                                |
| ------------------------------------------ | ------- | ------------------------------------------------------ |
| `CALLBACK_HTTP_TIMEOUT_MS`                 | 18000   | Per-request fetch timeout.                             |
| `CALLBACK_HTTP_MAX_RETRIES`                | 4       | Retries for mutations/actions (`callConvexWithRetry`). |
| `CALLBACK_STREAMING_HEARTBEAT_MAX_RETRIES` | 4       | Retries per streaming heartbeat call.                  |

## Heartbeat fatal thresholds

| Variable                                   | Default | Purpose                                             |
| ------------------------------------------ | ------- | --------------------------------------------------- |
| `CALLBACK_HEARTBEAT_FATAL_BURST`           | 10      | Consecutive failures → abort the turn.              |
| `CALLBACK_HEARTBEAT_FATAL_SLOW_COUNT`      | 8       | With slow window, consecutive failures → abort.     |
| `CALLBACK_HEARTBEAT_FATAL_SLOW_WINDOW_MS`  | 180000  | Window for slow fatal (covers Convex redeploy).     |
| `CALLBACK_HEARTBEAT_ABSOLUTE_MAX_FAILURES` | 28      | Hard cap on consecutive heartbeat failures.         |

## Buffers

| Variable                           | Default | Purpose                                               |
| ---------------------------------- | ------- | ----------------------------------------------------- |
| `CALLBACK_OUTPUT_BUFFER_MAX_BYTES` | 2000000 | Cap in-memory stdout/stderr; head trimmed, tail kept. |

Raw stdout is also appended to `/tmp/run-design.raw.jsonl`. Completion marker: `/tmp/run-design.done`.

## Overlap with Convex workflow watchdog

Quick tasks and automations use **both** the sandbox callback (this script) and, for tasks only, Convex heartbeat watchdogs.

| Layer                        | Owner                       | Quick-task values                   | Purpose                          |
| ---------------------------- | --------------------------- | ----------------------------------- | -------------------------------- |
| Callback `MAX_TOTAL_RUNTIME` | sandbox script              | 90m (`CLAUDE_MAX_TOTAL_RUNTIME_MS`) | Hard turn lifetime cap           |
| Daytona sandbox autostop     | Daytona                     | 90m (ephemeral + session)           | Sandbox inactivity stop          |
| Convex `checkStaleRuns`      | `_taskWorkflow/watchdog.ts` | 5m probe / 25m unverified kill      | Heartbeat staleness (tasks only) |
| `handleStaleRun`             | workflow                    | 2h                                  | Absolute backstop (tasks only)   |

Automations rely on callback timeouts only — no task watchdog.
