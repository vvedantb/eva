# Plan 021: Maintenance mode also refuses credential routes and defers webhook automations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 478be7912..HEAD -- packages/backend/convex/maintenance.ts packages/backend/convex/http.ts packages/backend/convex/mcp/native.ts packages/backend/convex/_automationEvents/dispatch.ts packages/backend/tests/automationEventDispatch.test.ts packages/backend/tests/maintenanceGates.test.ts`
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

## Why this matters

Maintenance mode (`MAINTENANCE=1` on the Convex deployment) exists so an
operator can run destructive migrations with Eva closed. Its doc comment says
"every user-facing call" is refused, but only the `auth*` wrappers and the MCP
endpoint check it. Two HTTP routes still hand out credentials while Eva is
"closed": `/api/git-credentials` mints GitHub installation tokens and
`/api/mcp/env-vars` returns decrypted repo env vars. The GitHub webhook still
fans events out to automations, which start agent runs mid-migration. After
this plan, both credential routes (and the Axiom alert route) answer 503, the
GitHub webhook defers automation dispatch until maintenance ends instead of
dropping it, and the doc comment lists exactly what is and is not gated.

## Current state

Files:

- `packages/backend/convex/maintenance.ts` — env-var switch and its doc comment (lines 5–20).
- `packages/backend/convex/functions.ts` — `authQuery` (line 522), `authMutation` (531), `authAction` (555) call `assertNotInMaintenance()` (lines 525, 534, 558). Do not edit.
- `packages/backend/convex/mcp/native.ts` — MCP endpoint gate (lines 38–46); the only HTTP gate today.
- `packages/backend/convex/http.ts` — HTTP router. Routes in scope: `/api/mcp/env-vars` (230–260), `/api/git-credentials` (287–334), Axiom alert prefix route (545–584), `/api/github/webhook` (586–761).
- `packages/backend/convex/_automationEvents/dispatch.ts` — `dispatch` internal mutation (line 120) fans a repo event out to automations and queues runs.
- `packages/backend/tests/automationEventDispatch.test.ts` — convex-test fixture for `dispatch` (fake timers, `install`, `runsOf`, `dispatch` helpers, lines 22–126).

`maintenance.ts:5-20` today:

```ts
/**
 * Maintenance mode: while the `MAINTENANCE` env var is "1", every user-facing
 * call (the `auth*` wrappers and the MCP endpoint) is refused, and the web app
 * shows a maintenance screen. Internal functions keep running, so
 * `npx convex run` migrations still work.
 ...
 */
export function isMaintenanceMode(): boolean {
  return process.env.MAINTENANCE === "1";
}

export function assertNotInMaintenance(): void {
  if (isMaintenanceMode()) throw new ConvexError(MAINTENANCE_ERROR);
}
```

`mcp/native.ts:38-46` — the 503 shape to reuse everywhere:

```ts
// Refused while maintenance mode is on, like the `auth*` wrappers.
export const mcpHandler = httpAction(async (ctx, request) =>
  isMaintenanceMode()
    ? Response.json(
        { error: "Eva is down for maintenance. Try again shortly." },
        { status: 503, headers: { "Retry-After": "300" } },
      )
    : handleMcp(ctx, request),
);
```

`http.ts:230-236` (env vars; authenticated by the `EVA_DEPLOY_KEY` env var, called by an external MCP server per `docs/mcp-security.md:33,56`; no caller in this repo):

```ts
http.route({
  path: "/api/mcp/env-vars",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyDeployKey(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
```

`http.ts:287-296` (git credentials; called by the in-sandbox git credential
helper with the sandbox's bearer secret, see
`_sandbox_runtime/gitCredentials.ts:103-110`):

```ts
http.route({
  path: "/api/git-credentials",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = extractBearerSecret(request);
    if (!secret) {
      return new Response("Unauthorized", { status: 401 });
    }
```

`http.ts:545-551` (Axiom alert; queues an automation run via `receiveAlert`):

```ts
http.route({
  pathPrefix: AXIOM_ALERT_PATH_PREFIX,
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const automationId = new URL(request.url).pathname.slice(
      AXIOM_ALERT_PATH_PREFIX.length,
    );
```

`http.ts:608-618` (GitHub webhook automation fan-out, after signature check):

```ts
    // Event-triggered automations (CI auto-fix, review responder, issue to
    // task, user automations). Independent of the state sync below.
    const repoEvents = parseRepoEvents(event ?? "", body);
    const ciPassed = parseCiPassed(event ?? "", body);
    for (const repoEvent of repoEvents) {
      await ctx.scheduler.runAfter(
        0,
        internal._automationEvents.dispatch.dispatch,
        { event: repoEvent },
      );
    }
```

`_automationEvents/dispatch.ts:120-124`:

```ts
export const dispatch = internalMutation({
  args: { event: repoEventValidator },
  returns: v.null(),
  handler: async (ctx, { event }) => {
    const repos = await findReposByOwnerAndName(ctx.db, event);
```

`_automationEvents/events.ts:116-117`:

```ts
/** A waiting `run` event gives up after this long, rather than queue forever. */
export const EVENT_RUN_MAX_WAIT_MS = 24 * 60 * 60_000;
```

### Intent of the maintenance commit

`a5f5d4e2b feat(maintenance): env-var maintenance mode for auth'd calls and web`.
Its changelog entry (then in `internal/changelog.md`) said: "WHY: Destructive
migrations need eva closed to users while they run." and "`internalAuth*`
wrappers, crons and sandbox callbacks keep running." and "Gaps: raw public
`query` / `mutation` / `action` functions and `ensureUserExists` are not gated".

The "sandbox callbacks keep running" claim is **false today**. Every sandbox
turn completion and heartbeat is an `authMutation` called with the sandbox VM
JWT, so it is refused in maintenance:

- `_sessions/workflow.ts:1034` `claimPendingTurn = authMutation(`; `:1610` `handleCompletion = authMutation(`
- `turns.ts:261` `heartbeatFromCallback = authMutation(`
- `handleCompletion = authMutation(` also in `_automations/runs.ts:342`, `_taskWorkflow/publicMutations.ts:61`, `docInterviewWorkflow.ts:281`, `evaluationWorkflow.ts:466`, `prRecapWorkflow.ts:256`, `projectInterviewWorkflow.ts:517`, `summarizeWorkflow.ts:176`, `testGenWorkflow.ts:344`.
- The daemon retries a call `CALLBACK_HTTP_MAX_RETRIES` (default 4, `callback-src/config.ts:160`) times with short backoff, then gives up.

### Decisions this plan makes

1. **Credential routes: refuse with 503.** Both mint or reveal secrets; in
   maintenance nothing should get new credentials. Gate before the auth check
   (maintenance state is already public via `maintenance:status`).
   Note: the in-sandbox helper caches a token until shortly before its
   `expiresAt` (`gitCredentials.ts:118-122`), so pushes with a cached token
   keep working for up to about an hour. That is accepted.
2. **GitHub webhook automations: defer, not drop.** GitHub does not redeliver
   failed deliveries on its own, so a 503 would lose CI auto-fix, review
   responder and issue-to-task events for good. The webhook keeps answering
   200 and keeps PR/push state sync (bookkeeping, like crons). `dispatch`
   itself re-schedules the event every 5 minutes while maintenance is on, and
   gives up (with a `console.warn`) after `EVENT_RUN_MAX_WAIT_MS` (24h), the
   same cap a waiting event run already has. Putting the check in `dispatch`
   (not in `http.ts`) keeps one gate for every dispatch caller.
3. **Axiom alert route: refuse with 503.** It returns a synchronous verdict
   to Axiom, so it cannot be deferred without a new table. Whether Axiom
   retries a 503 is not verified; an alert during maintenance may be lost.
4. **Sandbox callbacks: NOT exempt (no behaviour change; doc corrected).**
   Reasons: (a) the exemption would need a separate wrapper on ~11 functions
   (the list above), which is not an S change; (b) the VM token is readable by
   agent code in the sandbox (`_auth/sandboxIdentity.ts:18-21`), so any
   exempted function becomes a write path that runs during a destructive
   migration; (c) git credentials are gated by decision 1, so an in-flight
   turn's final push fails anyway. Operator procedure instead: turn
   maintenance on only when no agent turns are running; turns that were
   running are refused at completion and later ended by the stall watchdog.
   The doc comment must say this plainly.
5. **Raw public functions stay ungated, documented.**
   `presentations.ts:56-115` is anonymous slide sharing (no credentials);
   `extensionReleases.ts:45-80` is behind `EXTENSION_ADMIN_KEY`. Raw `action`s
   that call `getActionRepoWithAccess` (`functions.ts:72-81`) are gated
   indirectly, because it runs the `authQuery`
   `githubRepos.getAccessibleForAction` (`_githubRepos/queries.ts:386`).

Conventions (quoted from `CLAUDE.md`): "No `any`, `unknown`, `as`, or non-null
`!`" (existing `const body: unknown` lines in `http.ts` are not yours; add no
new ones); "Prefer simplicity, small diffs, co-location"; "Eliminate
duplication, centralise your changes so its easier to update them" — one 503
helper in `maintenance.ts`, used by `mcp/native.ts` and `http.ts`.
From `docs/eva-convex.md`: "Avoid importing `process.env` helpers into Convex
isolate workflow files." `dispatch.ts` is a plain internal mutation module,
not a workflow file, and `functions.ts` already reads the same flag from
mutations, so importing `isMaintenanceMode` there is fine.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| New gate tests | `pnpm --filter @eva/backend test -- tests/maintenanceGates.test.ts` | all pass |
| Dispatch tests | `pnpm --filter @eva/backend test -- tests/automationEventDispatch.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

Never run `npx convex codegen`, `convex dev` or `convex deploy`. `dispatch`
gains an optional arg only; the generated API types read args from the
validator, so no codegen is needed. Run only targeted test files: 2 tests in
`tests/sessionChatTabs.test.ts` already fail and are not yours. The lint rule
`eva/no-source-text-in-tests` bans tests that read source text; test behaviour
only.

## Scope

**In scope**:

- `packages/backend/convex/maintenance.ts`
- `packages/backend/convex/mcp/native.ts`
- `packages/backend/convex/http.ts`
- `packages/backend/convex/_automationEvents/dispatch.ts`
- `packages/backend/tests/maintenanceGates.test.ts` (create)
- `packages/backend/tests/automationEventDispatch.test.ts`
- `internal/changelog/2026-11.md`

**Out of scope**:

- `functions.ts` auth wrappers — already gated.
- Any exemption for sandbox callbacks (decision 4) — operator decision; do not add one.
- `/api/streaming/heartbeat`, `/api/preview/activity`, `/api/harness-skills/report` (HMAC sandbox pings), OAuth callbacks (`/api/github/oauth/callback`, `/api/connectors/oauth/callback`), `/api/changelog/vote`, `/.well-known/*`, extension update routes — list them as "not gated" in the doc comment only.
- PR/push state sync and `arenaBrowserWorkflow.startPrRuns` in the GitHub webhook — leave running; note in the doc comment.
- `presentations.ts`, `extensionReleases.ts`, `auth.ts:ensureUserExists`.
- Web and mobile clients.

## Git workflow

- Stay on the current branch. No new branch, push or PR unless the operator says so.
- One commit, conventional style as in `git log` (e.g. `fix(github): stop late PR webhooks from reopening a merged PR`). Suggested: `fix(backend): maintenance mode refuses credential routes and defers webhook automations`.

## Steps

### Step 1: Add the shared HTTP gate and rewrite the doc comment

In `maintenance.ts`, add below `assertNotInMaintenance`:

```ts
/** Seconds a refused HTTP caller should wait; also the dispatch re-check interval. */
export const MAINTENANCE_RETRY_AFTER_SECONDS = 300;

/** 503 for an HTTP route while maintenance mode is on; null otherwise. */
export function maintenanceHttpResponse(): Response | null {
  if (!isMaintenanceMode()) return null;
  return Response.json(
    { error: "Eva is down for maintenance. Try again shortly." },
    {
      status: 503,
      headers: { "Retry-After": String(MAINTENANCE_RETRY_AFTER_SECONDS) },
    },
  );
}
```

Replace the doc comment at lines 5–13 with one that lists exactly:

- Refused: `authQuery` / `authMutation` / `authAction` (ConvexError `MAINTENANCE_ERROR`); HTTP 503 from the MCP endpoint, `/api/git-credentials`, `/api/mcp/env-vars`, the Axiom alert route.
- Deferred: GitHub webhook automation dispatch (re-checked every 5 minutes, dropped after 24h).
- Also refused, by design: sandbox turn callbacks (`claimPendingTurn`, `handleCompletion`, `heartbeatFromCallback`) because they are `authMutation`s. Turn maintenance on only when no agent turns are running.
- Still running: internal functions, crons, workflows, `internalAuth*`, GitHub PR/push state sync and Arena PR runs, HMAC sandbox pings, OAuth callbacks, raw public functions (`presentations`, `extensionReleases`, `ensureUserExists`, `maintenance:status`).
- Keep the two `npx convex env` lines.

Then in `mcp/native.ts:38-46`, use the helper (keep the comment):

```ts
export const mcpHandler = httpAction(
  async (ctx, request) =>
    maintenanceHttpResponse() ?? (await handleMcp(ctx, request)),
);
```

and import `maintenanceHttpResponse` instead of `isMaintenanceMode` (remove the unused import).

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0. `grep -n "Retry-After" packages/backend/convex/mcp/native.ts` → no match.

### Step 2: Gate the three HTTP routes

In `http.ts`, import `maintenanceHttpResponse` from `./maintenance`. As the
**first** statement inside each of these handlers add:

```ts
    const refused = maintenanceHttpResponse();
    if (refused) return refused;
```

- `/api/mcp/env-vars` handler (before `verifyDeployKey`, line 234)
- `/api/git-credentials` handler (before `extractBearerSecret`, line 291)
- Axiom alert `pathPrefix` handler (before the `automationId` line, line 549)

Do not add it to `/api/github/webhook`.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0. `grep -c "maintenanceHttpResponse()" packages/backend/convex/http.ts` → 3.

### Step 3: Defer automation dispatch while maintenance is on

In `_automationEvents/dispatch.ts`:

- Import `isMaintenanceMode, MAINTENANCE_RETRY_AFTER_SECONDS` from `../maintenance` and `EVENT_RUN_MAX_WAIT_MS` from `./events` (add to the existing import list).
- Change `dispatch` args to `{ event: repoEventValidator, deferredSince: v.optional(v.number()) }`.
- At the top of the handler (destructure `{ event, deferredSince }`):

```ts
    // Maintenance: keep the event and try again later. GitHub does not
    // redeliver on its own, so refusing would lose it.
    if (isMaintenanceMode()) {
      const since = deferredSince ?? Date.now();
      if (Date.now() - since > EVENT_RUN_MAX_WAIT_MS) {
        console.warn(
          `[automation-dispatch] dropped ${event.kind} for ${event.owner}/${event.name}: maintenance outlasted ${EVENT_RUN_MAX_WAIT_MS}ms`,
        );
        return null;
      }
      await ctx.scheduler.runAfter(
        MAINTENANCE_RETRY_AFTER_SECONDS * 1000,
        internal._automationEvents.dispatch.dispatch,
        { event, deferredSince: since },
      );
      return null;
    }
```

If `RepoEvent` does not have `owner` and `name` on every variant (check
`_automationEvents/events.ts`), log `event.kind` only. Leave `http.ts` callers
unchanged (they pass no `deferredSince`).

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0. `pnpm --filter @eva/backend test -- tests/automationEventDispatch.test.ts` → all existing tests pass.

### Step 4: Tests

See "Test plan". **Verify**: both test commands → all pass, including 7 new tests.

### Step 5: Changelog and lint

Add at the top of `internal/changelog/2026-11.md`, directly under `# Changelog — November 2026`:

```
## Maintenance mode covers credential routes and webhook automations - 2026-11-12

WHY: `MAINTENANCE=1` refused only the `auth*` wrappers and MCP. `/api/git-credentials` and `/api/mcp/env-vars` still handed out tokens and env vars, and GitHub webhooks still started automations mid-migration.

- `maintenanceHttpResponse` (503, `Retry-After: 300`) gates MCP, `/api/git-credentials`, `/api/mcp/env-vars` and the Axiom alert route.
- `_automationEvents/dispatch` re-schedules itself every 5 minutes while maintenance is on, then drops the event after 24h. PR/push state sync still runs.
- Correction: sandbox turn callbacks are `authMutation`s and are refused in maintenance (the earlier entry said they keep running). Turn maintenance on only when no turns are running.
```

**Verify**: `pnpm lint` → exit 0. `git status --short` → only in-scope files (plus `plans/README.md`).

## Test plan

New file `packages/backend/tests/maintenanceGates.test.ts`. Model it on
`tests/automationEventDispatch.test.ts` (`convexTest(schema, modules)` with
`const modules = import.meta.glob("../convex/**/*.ts")`, `TIMEOUT_MS = 30_000`).
Use `vi.stubEnv("MAINTENANCE", "1")` per test and `vi.unstubAllEnvs()` in
`afterEach`. Call routes with convex-test's `t.fetch(path, init)`:

1. Maintenance on: `POST /api/git-credentials` with header `Authorization: Bearer test` → status 503, header `Retry-After` is `"300"`.
2. Maintenance on: `POST /api/mcp/env-vars` with JSON body `{"repoId":"x","userId":"y"}` and no auth → 503.
3. Maintenance off: `POST /api/mcp/env-vars` with no auth → 401 (gate does not change normal auth).
4. Maintenance on: `POST` to `AXIOM_ALERT_PATH_PREFIX + "abc"` (import from `../convex/_automations/alertWebhook`) → 503.

In `tests/automationEventDispatch.test.ts`, add a `describe("maintenance")`
using the existing `fixture()`, `install`, `runsOf` and the `labelled` event
(fake timers are already on; add `afterEach(() => vi.unstubAllEnvs())` inside
the describe):

5. Maintenance on: install a user automation on `issue_labeled`, `await dispatch(labelled)` → `runsOf` is empty, and `_scheduled_functions` (via `t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())`) has a job whose `name` includes `"dispatch:dispatch"` and whose `args[0].deferredSince` is a number.
6. Maintenance off: `t.mutation(internal._automationEvents.dispatch.dispatch, { event: labelled, deferredSince: Date.now() })` → `runsOf` has 1 run (a deferred event still dispatches).
7. Maintenance on: same call with `deferredSince: Date.now() - EVENT_RUN_MAX_WAIT_MS - 1` → no run and no new `dispatch:dispatch` job.

Verification: `pnpm --filter @eva/backend test -- tests/maintenanceGates.test.ts tests/automationEventDispatch.test.ts` → all pass, 7 new tests.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `pnpm --filter @eva/backend test -- tests/maintenanceGates.test.ts tests/automationEventDispatch.test.ts` passes, with 7 new tests
- [ ] `grep -c "maintenanceHttpResponse()" packages/backend/convex/http.ts` → 3
- [ ] `grep -n "isMaintenanceMode" packages/backend/convex/_automationEvents/dispatch.ts` → 1 match in the handler (plus the import)
- [ ] `grep -n "Retry-After" packages/backend/convex/mcp/native.ts` → no match
- [ ] The `maintenance.ts` doc comment names `/api/git-credentials`, `/api/mcp/env-vars`, and says sandbox turn callbacks are refused
- [ ] `pnpm lint` exits 0; `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- `t.fetch` cannot load the `http.ts` router under convex-test (for example an import from `@vvedantb/server` fails at module load). Report it; do not mock the router or drop tests 1–4 silently.
- Typecheck asks for regenerated `_generated/api.d.ts` after Step 3. Do not run codegen; report.
- You find a sandbox completion or heartbeat function that is NOT an `authMutation` (i.e. callbacks are already exempt somehow), or a caller of `/api/git-credentials` outside the sandbox helper. Decision 4 and decision 1 rest on these facts.
- The operator asks for running turns to finish during maintenance. That needs a callback exemption (decision 4), which is a separate, larger plan; and `/api/git-credentials` must then stay open for those sandboxes.
- A GitHub webhook path other than `dispatch` starts agent work and you think it must be gated — report it, do not extend scope.

## Maintenance notes

- Any new HTTP route that returns credentials or starts work must call `maintenanceHttpResponse()` first and be added to the `maintenance.ts` doc comment.
- Any new caller of `dispatch` gets deferral for free. `receiveAlert` has no deferral; if lost alerts matter, persist alerts in a table and dispatch them after maintenance.
- Reviewer: check the 503 gate comes before auth in all three routes; check the deferral cannot loop for ever (24h cap) and that `deferredSince` is carried, not reset, on each re-schedule.
- Deferred follow-up (operator decision): a `sandboxCallbackMutation` wrapper that skips the maintenance gate only for lease-fenced turn callbacks, so turns in flight can finish. If that lands, revisit `/api/git-credentials`: the final push in `persistTurnWork` needs a token.
- Not audited here: every raw public `action` that does not call `getActionRepoWithAccess` or another `auth*` function. A follow-up can list them and gate the ones that touch data.
