# Eva Agent Architecture

## Sandbox-Driven Execution Model

Eva runs Claude Code (and other agent runtimes) **inside sandboxes**, not via a host-held connection. This is a deliberate architectural choice driven by Convex's action time limits.

### The Model

1. **In-sandbox agent loop**: An esbuild-bundled callback script (`callback-src/`) is uploaded to the sandbox and runs detached as a self-contained Node process. It drives the agent runtime, captures events, and manages its own turn lifecycle.

2. **Sandbox → host communication**: The callback pushes events to Convex via HTTP:
   - HMAC-signed heartbeats every 150 ms (`POST /api/streaming/heartbeat` → `streaming` table)
   - Completion events via mutation (triggers durable workflow `awaitEvent`)
   - Blocking questions and other round-trips via polling mutations

3. **Host → sandbox communication**: Short-lived exec/writeFile calls only:
   - Daemon pulls turns via `claimPendingTurn` mutation (50 ms polling)
   - Questions answered via `pendingQuestions:claimAnswer` mutation (300 ms polling)
   - No persistent connection from host to sandbox

### Why This Design?

**Convex actions have a ~10-minute wall-clock ceiling.** Multi-minute agent turns exceed this, so work must decompose into short durable-workflow steps. The solution is to run the loop in-sandbox and block the workflow on completion events the sandbox fires back.

This avoids:

- Standing up a new persistent host tier (new infra, new failure domain, new reconnect semantics)
- Tying action time to agent turn time (would require hand-offs mid-turn or abandoning step-based architecture)
- Long-lived sockets that must survive deployment cycles

**See also:** `convex/_sandbox_runtime/resumeSandboxSteps.ts`, `convex/_sessions/workflow.ts` (`awaitEvent`), `convex/workflowWatchdog.ts`, and the header comments in `convex/taskWorkflow.ts` for the rationale repeated across workflows.

## The Callback Bundle

**Source:** `callback-src/` (entry: `index.ts`)  
**Generated artifact:** `convex/_daytona/callbackScript.generated.ts` (esbuild bundle, regenerated on `predeploy`)  
**Runtime:** Detached Node process inside the sandbox, communicates only via HTTP POSTs and polling mutations

The callback owns seven core capabilities:

### 1. Blocking AskUserQuestion Mid-Turn

- Tool gate `canUseTool` blocks every tool except `AskUserQuestion`
- Questions POST to the `pendingQuestions` table
- Answers polled every 300 ms; turn continues with user response as `updatedInput.answers`
- **File:** `callback-src/runtime/pendingQuestion.ts`

### 2. Canonical Tool-UI Parser with Subagent Nesting

- Single evolving todo checklist across tool-use/tool-result deltas
- Subagent steps nested under parent `toolUseId` for drill-in UI
- Feeds `packages/ui/src/ai-elements/activity-tasks.tsx`
- **Files:** `callback-src/parse/canonical.ts`, `callback-src/parse/toolSteps.ts`

### 3. Usage & Cost Capture

- `rawResultEvent` from the Agent SDK stored verbatim in the `logs` table
- Later parsed for usage/billing via codex pricing tables in `callback-src/config.ts`
- **File:** `callback-src/runtime/heartbeats.ts` (recordCompletionLog flow)

### 4. Multi-Layer Heartbeat & Watchdog

- In-sandbox: 150 ms flush + 10 s keep-alive ping; fatal-failure escalation
- Per-turn daemon watchdog on `NO_MESSAGE_TIMEOUT` / `MAX_TOTAL_RUNTIME`
- Host-side liveness via `convex/workflowWatchdog.ts`, `convex/_taskWorkflow/watchdog.ts`
- **Files:** `callback-src/runtime/heartbeats.ts`, `callback-src/providers/claudeSdkDaemon.ts:131`

### 5. MCP-Config Injection

- The launcher exports `EVA_MCP_AUTH` and `EVA_MCP_BASE_URL` only to the callback process
- The callback converts them into one typed in-memory HTTP server descriptor, then removes the variables before agent tools spawn
- Claude and Cursor receive the same descriptor through their SDK `mcpServers` options; no MCP config file is written
- The credential-bearing launch script unlinks itself before spawning the long-lived callback
- **Files:** `callback-src/evaMcp.ts`, `callback-src/providers/claudeSdk.ts`, `callback-src/providers/cursorSdk.ts`, `convex/_sandbox_runtime/launch.ts`

### 6. Background-Task Disabling

- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` prevents sub-agents from spawning
- Sub-agents can't report completion in a single turn; their output is lost
- **File:** `callback-src/providers/claudeSdk.ts:60`, commit `f0346edd` (recent hardening)

### 7. Warm Daemon & Sub-Second Turn Starts

- Persistent `query()` fed by async iterable (stays warm across turns)
- Idle-exits after 45 minutes; next turn respawns clean
- Prewarm bootstrapped on session page-open to hide cold-start penalty (~20 s on first turn without prewarm)
- **File:** `callback-src/providers/claudeSdkDaemon.ts`

### Bonus: Multi-Runtime Multiplexing

The same callback bundle already runs Claude, Codex, OpenCode, and Cursor — every one of them through its vendor SDK in-process, with no CLI subprocess left. Claude and Codex use warm daemons; Cursor and OpenCode run one shot per turn. OpenCode is the one provider whose SDK is an HTTP client: the callback keeps a detached `opencode serve` per sandbox (`callback-src/providers/opencodeServer.ts`) and reuses it across turns.

Every runner reshapes its vendor events into the JSONL line shapes the provider parsers already understand, then pushes them through `processRealtimeStdoutChunk`, so streaming, tool steps, session persistence and completion stay shared.

## Sandbox Provider Abstraction

**File:** `convex/_sandbox/provider.ts` (contract) + `vercelProvider.ts` (implementation)

Eva runs sandboxes behind a `SandboxClient` / `SandboxHandle` contract. Vercel is the only sandbox provider (Daytona support was removed; `SandboxProviderKind` and `SandboxCredentials` are Vercel-only types, and `_sandbox/factory.ts` has a single `getSandboxClient` path).

- **Vercel:** Wraps raw `@vercel/sandbox` ^2.4.0; name-addressed, persistent-by-default, stops auto-snapshot, restores sub-second (~0.3s regardless of size).

Vercel provider includes hard-won delta workarounds: `resume:false` refresh (to avoid auto-resuming stopped VMs), >4 KB env via `.eva-env.sh`, 4-port cap, IPv4-only.

## Evaluating the Vercel AI SDK Harness

Latest re-evaluation, revisit triggers and the credential-brokering follow-up: `AI_SDK_HARNESS_EVALUATION.md`.

In July 2026, Anthropic/Vercel released `@ai-sdk/harness-claude-code` (v1.0.37, experimental). It runs a bridge inside a sandbox and streams events to a **host-held WebSocket** for the entire turn. **Eva rejected adoption** for these reasons:

### Architectural Mismatch

The harness is **host-driven**: a long-lived host process calls `agent.stream()` and holds a live WebSocket-backed stream to the sandbox bridge for each turn. Eva is **sandbox-driven** and intentionally avoids host-held sockets because:

1. Convex actions cap at ~10 minutes (doesn't leave room for multi-minute turns in a single action)
2. Adopting the harness would require a new long-lived Node service to host the bridge client
3. This reintroduces the stateful-host failure domain the current architecture was designed to avoid

### Feature Regression

The harness normalizes to a common contract (read/write/edit/bash/glob/grep/webSearch, approvals only in `allow-reads`/`allow-edits` modes). Eva's bridge owns seven custom capabilities (listed above) that the UI depends on. Adopting the harness would lose:

- Blocking AskUserQuestion mid-turn
- Subagent-nested tool-UI steps + todo checklists
- `rawResultEvent` usage passthrough for cost tracking
- Heartbeat/watchdog hooks
- MCP-config injection
- Background-task disabling enforcement
- Warm daemon warm-pull turn model

### No Net Gain

- Vercel Sandbox support: Already built via `vercelProvider.ts`, the sole sandbox provider (with edge cases the harness likely lacks)
- Multi-runtime support: Already multiplexes codex/opencode/cursor in the same bridge
- Snapshot invalidation: Equivalent to eva's callback fingerprint + arguably better (pinned Agent SDK 0.3.201 baked into snapshots for cold-start + version control vs. install-at-first-session)

### Maturity Risk

Published 4 June 2026, breaking-changes warning in documentation. Not suitable for critical path.

### When to Revisit

Only if eva stands up a long-lived Node host tier (e.g. for sub-150 ms token streaming). Even then, direct sandbox→browser streaming would be a smaller step.

## Related Files

- `convex/_daytona/callbackScript.generated.ts` — bundled agent loop (regen'd on predeploy)
- `convex/_daytona/launch.ts` — uploads bundle, launches detached
- `convex/_daytona/execution.ts` — prewarm daemon, dev-server detection
- `convex/_daytona/helpers.ts` — token minting, script signing
- `convex/_daytona/resumeSandboxSteps.ts` — archived-sandbox thaw across durable steps
- `convex/_sandbox/provider.ts` — abstraction contract
- `convex/_sandbox/vercelProvider.ts` — implementation (sole sandbox provider)
- `convex/http.ts` — heartbeat + mutation endpoints
- `convex/_sessions/workflow.ts` — durable-workflow main loop, `awaitEvent` on completion
- `convex/_sessions/execution.ts` — prompt staging, daemon prewarm trigger
- `convex/workflowWatchdog.ts`, `convex/_taskWorkflow/watchdog.ts` — liveness checks
- `convex/pendingQuestions.ts` — blocking question round-trip table + mutations
- `callback-src/` — in-sandbox agent source (entry: `index.ts`)
  - `providers/claudeSdk.ts` — SDK integration, `query()` call
  - `providers/claudeSdkDaemon.ts` — warm persistent daemon
  - `runtime/heartbeats.ts` — HMAC heartbeat flush + completion POST
  - `runtime/pendingQuestion.ts` — blocking question gate + polling
  - `parse/canonical.ts` — tool-UI parser + todo checklist
  - `parse/toolSteps.ts` — tool-use/result event handling

## Key Constraints

- **Convex action wall-clock limit:** ~10 minutes (cited repeatedly across workflows)
- **IPv4-only:** Daytona/Vercel sandboxes don't support IPv6; all services bind to IPv4
- **Vercel port cap:** 4 exposed ports — 3000 (app Preview auth proxy), 8080 (editor), 6080 (desktop), 54321 (local Supabase Kong). App listens on the UI port (or 13000 when UI port is 3000); Eva launches `exec next|vite -p <listen>` so customer `-p` flags cannot steal the wrong port.
- **Daemon idle-exit:** 45 minutes; next turn respawns
- **Heartbeat flush:** 150 ms (accumulated events)
- **Heartbeat touch ping:** 10 s (keep watchdog alive during silent tool runs)
- **Daemon turn poll:** 50 ms (`claimPendingTurn`)
- **Question answer poll:** 300 ms (`pendingQuestions:claimAnswer`)
