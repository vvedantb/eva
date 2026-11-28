# Plan 002: Keep the sandbox Convex token out of agent processes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` if that file exists — unless a reviewer dispatched you
> and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 478be7912..HEAD -- packages/backend/callback-src/config.ts packages/backend/callback-src/evaMcp.ts packages/backend/callback-src/providers/cursorSdkDaemon.ts packages/backend/callback-src/tests/cursorSdkDaemon.test.ts packages/backend/callback-src/tests/evaMcp.test.ts packages/backend/convex/_sandbox_runtime/launch.ts packages/backend/convex/_auth/sandboxIdentity.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (touches how the daemon authenticates to Convex; a mistake stops every sandbox turn)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `478be7912`, 2026-11-12
- Refreshed: 2026-11-12 (was planned at 2042a0ac7)

## Why this matters

Every sandbox gets `CONVEX_TOKEN`: a 24-hour ES256 JWT whose subject is the
launching user's Clerk id. Convex accepts it as a full user identity. The
callback daemon keeps it in `process.env`, and every agent provider copies
`process.env` into the agent's environment. So any agent shell command (or
prompt-injected code in the user's repo) can read the token with `env` and
call public Convex functions as the user, across every repo the user can
reach. The original Phase B (refuse secret reveals to the VM token) has
already landed (commit `b6a1befad`, #1157: `rejectSandboxCaller`). This plan
is the remaining Phase A: remove the token and two other Eva-internal
secrets from the environment that agents inherit. It is defence in depth: a
process running as the same OS user can still read the daemon's start-up
environment from `/proc/<pid>/environ`.

## Current state

### Already done — do not redo

`packages/backend/convex/_auth/sandboxIdentity.ts` exists. It exports
`isSandboxIdentity`, `isSandboxVmIdentity` (sandbox issuer and no `evaMcp`
claim) and `rejectSandboxCaller` (throws `"Not available from a sandbox"`).
It is called first in `repoEnvVarsActions.ts:19`, `teamEnvVarsActions.ts:19`,
`userProviderAccountsActions.ts:34` and `:75`, and in about 15 other
functions (`grep -rn "rejectSandboxCaller(" packages/backend/convex`).
`tests/sandboxIdentityContract.test.ts` covers it. `sandboxJwt.ts:28-48`
`signSandboxUserJwt(clerkId, purpose)` now mints `vm` (24h, no claim) and
`mcp` (1h, `evaMcp: true`) tokens. None of these is in scope.

### Files and roles

- `packages/backend/convex/_sandbox_runtime/launch.ts` — writes the runner script that exports the env: `CONVEX_TOKEN` (line 542), `STREAMING_HMAC` (line 578), `HARNESS_CATALOG_TOKEN` (line 582). Out of scope; the callback needs them at start-up.
- `packages/backend/callback-src/config.ts` — reads the env once at import (lines 5-12).
- `packages/backend/callback-src/evaMcp.ts` — the existing scrub pattern for MCP bearer tokens (`consumeEvaMcpEnvironment`, lines 76-117; module-level consume and handoff export, lines 269-280).
- `packages/backend/callback-src/providers/cursorSdkDaemon.ts` — spawns a trusted child (the Cursor turn worker) that runs the same callback bundle (lines 165-212).

Callback env capture, `packages/backend/callback-src/config.ts:1-12`:

```ts
import { existsSync } from "fs";
import { TURN_MAX_RUNTIME_MS } from "@eva/shared/agentTurnLimits";
import { parseLinkedReposEnv, resolveAgentCwd } from "./linkedRepos.js";

export const CONVEX_URL = process.env.CONVEX_URL;
export const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || CONVEX_URL;
export const CONVEX_TOKEN = process.env.CONVEX_TOKEN;
export const STREAMING_HMAC = process.env.STREAMING_HMAC || "";
/** Short-lived, single-use credential for `/api/harness-skills/report`. */
export const HARNESS_CATALOG_TOKEN = process.env.HARNESS_CATALOG_TOKEN || "";
export const HARNESS_CATALOG_SANDBOX_ID =
  process.env.HARNESS_CATALOG_SANDBOX_ID || "";
```

Import-order fact: ES module imports run before the importing module's body.
`config.ts` no longer imports `evaMcp.js` (the reverse is now true:
`evaMcp.ts` imports `WORK_DIR` from `./config.js`). **If you put a delete of
`CONVEX_TOKEN` into any module that `config.ts` imports, and `config.ts`
still reads `process.env.CONVEX_TOKEN`, `config.ts` will read `undefined` and
every Convex call from the sandbox will be unauthenticated.** The design
below avoids this: the new module both reads and deletes, and `config.ts`
re-exports its values.

Only `config.ts` reads these three variables from `process.env` (checked with
`grep -rn "CONVEX_TOKEN\|STREAMING_HMAC\|HARNESS_CATALOG_TOKEN" packages/backend/callback-src --include=*.ts | grep -v /tests/`).
No sandbox shell script reads `$CONVEX_TOKEN`. Consumers import from
`config.js`: `http/convexClient.ts:131,177,188,208-211,242-245`,
`providers/githubToken.ts:1,104`, `index.ts:156`,
`providers/claudeSdkDaemon.ts:659`.

The scrub pattern to copy, `packages/backend/callback-src/evaMcp.ts:76-91`
and `269-280`:

```ts
export function consumeEvaMcpEnvironment(env: EvaMcpEnvironment): {
  servers: McpServers;
  workerHandoffEnv: Record<string, string>;
} {
  ...
  // The callback keeps the MCP descriptor in memory. Removing the transport
  // variables stops agent tools and unrelated child processes inheriting the
  // bearer token through their environment.
  const evaAuth = env.EVA_MCP_AUTH;
  const evaBase = env.EVA_MCP_BASE_URL;
  delete env.EVA_MCP_AUTH;
  delete env.EVA_MCP_BASE_URL;
  ...
}

const consumed = consumeEvaMcpEnvironment(process.env);
export const evaMcpServers = loadRepoMcpServers(consumed.servers);
/** ... re-exported for spawning a trusted child that runs this same callback bundle ... */
export const evaMcpWorkerHandoffEnv = consumed.workerHandoffEnv;
```

Where agent and helper env is built from `process.env` (all inherit
whatever is left):

- `callback-src/providers/claudeSdk.ts:415-416` — `const env: Record<string, string | undefined> = { ...process.env, ...`
- `callback-src/providers/opencodeServer.ts:141` — `env: { ...process.env },`
- `callback-src/providers/codexAppServerClient.ts:37` — `env: { ...process.env, CODEX_HOME: CODEX_RUNTIME_HOME_DIR },`
- `callback-src/providers/codexSdk.ts:42` — `for (const [key, value] of Object.entries(process.env)) {`
- `callback-src/utils.ts:196` (`runTimedBashSync`), `callback-src/runtime/gitExec.ts:26` — bash/git helpers.

**The one trusted child that needs `CONVEX_TOKEN`**:
`cursorSdkDaemon.ts:190-212` `spawnCursorTurnWorker` spawns
`process.execPath` on `cursorTurnWorkerEntryPath()` (`process.argv[1]`,
line 107). That worker imports `config.js` and calls Convex. It gets the MCP
variables back through `buildCursorTurnWorkerEnv` (lines 172-188):

```ts
export function buildCursorTurnWorkerEnv(
  baseEnv: NodeJS.ProcessEnv,
  mcpHandoffEnv: Record<string, string>,
  turn: ClaimedTurn,
  promptFile: string,
): NodeJS.ProcessEnv {
  const workerEnv: NodeJS.ProcessEnv = {
    ...baseEnv,
    ...mcpHandoffEnv,
    EVA_CURSOR_TURN_WORKER_PROMPT_FILE: promptFile,
    ...
```

and `spawnCursorTurnWorker` calls it with
`(process.env, evaMcpWorkerHandoffEnv, turn, promptFile)` (lines 194-199).
It must get the scrubbed Convex secrets back the same way, or Cursor turns
lose Convex access.

### Conventions (quoted from `/tmp/repo/CLAUDE.md`)

- "No `any`, `unknown`, `as`, or non-null `!`. No `isRecord(object: unknown)` — parse at the boundary (Zod). Hard types → rethink design."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary."
- "Eliminate duplication, centralise your changes so its easier to update them"
- Tests must exercise behaviour. The lint rule `eva/no-source-text-in-tests` (`scripts/oxlint-plugin-eva/rules/no-source-text-in-tests.mjs`) bans tests that read source files as text.
- Callback source only reaches sandboxes through the generated bundle `convex/_sandbox_runtime/callbackScript.generated.ts`. Rebuild with `pnpm --filter @eva/backend build:callback` (`scripts/build-callback-script.mjs`: typechecks `callback-src`, then esbuild-bundles from `callback-src/index.ts`; new modules are included through imports). Never hand-edit the generated file.
- Changelog: `internal/changelog/README.md` — new entries go at the top of the current month's file (`internal/changelog/2026-11.md`), directly under `# Changelog — November 2026`, as `## <Title> - <YYYY-MM-DD>` followed by bullets (what changed and why).

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Callback typecheck | `pnpm --filter @eva/backend typecheck:callback` | exit 0 |
| Convex typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Rebuild callback bundle | `pnpm --filter @eva/backend build:callback` | exit 0; `convex/_sandbox_runtime/callbackScript.generated.ts` changes |
| Targeted tests | `pnpm --filter @eva/backend test -- <path relative to packages/backend>` | all pass |
| Lint | `pnpm lint` | exit 0 |

Run only the targeted test files listed in each step. At planning time 2
backend tests in `tests/sessionChatTabs.test.ts` fail; they are not yours to
fix. NEVER run `npx convex codegen`, `convex dev` or `convex deploy` — they
upload to the linked deployment.

## Suggested executor toolkit

- Read `packages/backend/callback-src/tests/evaMcp.test.ts` and `packages/backend/callback-src/tests/blockingQuestionsGate.test.ts` (env save/restore with `vi.resetModules()`, lines 1-36) before writing tests.

## Scope

**In scope**:
- `packages/backend/callback-src/callbackSecrets.ts` (create)
- `packages/backend/callback-src/config.ts`
- `packages/backend/callback-src/providers/cursorSdkDaemon.ts`
- `packages/backend/callback-src/tests/callbackSecrets.test.ts` (create)
- `packages/backend/callback-src/tests/cursorSdkDaemon.test.ts`
- `packages/backend/convex/_sandbox_runtime/callbackScript.generated.ts` (regenerated only, never hand-edited)
- `internal/changelog/2026-11.md`

**Out of scope** (do NOT touch):
- `convex/_auth/sandboxIdentity.ts` and every `rejectSandboxCaller` call site — already done.
- `convex/sandboxJwt.ts` and `convex/auth.config.ts` — changing the token format or provider list breaks running sandboxes.
- `convex/_sandbox_runtime/launch.ts` — keep exporting the variables; the callback needs them at start-up.
- `callback-src/evaMcp.ts` — already correct; do not merge it with the new module.
- AI provider credentials in the env (`CODEX_AUTH_JSON_BASE64`, `OPENCODE_AUTH_JSON_BASE64`, Claude credentials) and `GITHUB_TOKEN`/`GH_TOKEN` — agents need these. GitHub token scope is plan 003.
- `HARNESS_CATALOG_SANDBOX_ID` — an id, not a secret.

## Git workflow

- Work on the current branch. Do not create a branch, push or open a PR unless told.
- One commit, conventional style (see `git log --oneline -10`, for example `fix(github): stop late PR webhooks from reopening a merged PR`): `fix(callback): scrub Convex token and HMAC from agent env`.

## Steps

### Step 1: Create `callback-src/callbackSecrets.ts`

Model it on `consumeEvaMcpEnvironment`. Target shape (no `as`, no `as const`):

```ts
/**
 * Eva-internal credentials the callback uses to call Convex. Read once at
 * import, then deleted from `process.env`, so agent tools (which inherit
 * `process.env`) never see them. Same pattern as `evaMcp.ts`.
 *
 * `config.ts` re-exports these values. Do not read these keys from
 * `process.env` anywhere else: after this module loads they are gone.
 */
type CallbackSecretKey =
  | "CONVEX_TOKEN"
  | "STREAMING_HMAC"
  | "HARNESS_CATALOG_TOKEN";

const CALLBACK_SECRET_KEYS: readonly CallbackSecretKey[] = [
  "CONVEX_TOKEN",
  "STREAMING_HMAC",
  "HARNESS_CATALOG_TOKEN",
];

export type CallbackSecrets = Partial<Record<CallbackSecretKey, string>>;

export function consumeCallbackSecrets(env: Record<string, string | undefined>): {
  secrets: CallbackSecrets;
  workerHandoffEnv: Record<string, string>;
} {
  const secrets: CallbackSecrets = {};
  const workerHandoffEnv: Record<string, string> = {};
  for (const key of CALLBACK_SECRET_KEYS) {
    const value = env[key];
    delete env[key];
    if (value) {
      secrets[key] = value;
      workerHandoffEnv[key] = value;
    }
  }
  return { secrets, workerHandoffEnv };
}

const consumed = consumeCallbackSecrets(process.env);
export const callbackSecrets = consumed.secrets;
/** Handed back only to the trusted Cursor turn worker (same callback bundle). */
export const callbackSecretsWorkerHandoffEnv = consumed.workerHandoffEnv;
```

**Verify**: `pnpm --filter @eva/backend typecheck:callback` → exit 0.

### Step 2: Make `config.ts` re-export the captured values

In `packages/backend/callback-src/config.ts`, add
`import { callbackSecrets } from "./callbackSecrets.js";` with the other
imports (lines 1-3), and change lines 7, 8 and 10 to:

```ts
export const CONVEX_TOKEN = callbackSecrets.CONVEX_TOKEN;
export const STREAMING_HMAC = callbackSecrets.STREAMING_HMAC || "";
/** Short-lived, single-use credential for `/api/harness-skills/report`. */
export const HARNESS_CATALOG_TOKEN = callbackSecrets.HARNESS_CATALOG_TOKEN || "";
```

The exported names and types must not change, so no consumer changes.

**Verify**:
- `pnpm --filter @eva/backend typecheck:callback` → exit 0.
- `grep -rn "process.env.CONVEX_TOKEN\|process.env.STREAMING_HMAC\|process.env.HARNESS_CATALOG_TOKEN" packages/backend/callback-src --include=*.ts | grep -v /tests/` → no matches.

### Step 3: Hand the secrets back to the Cursor turn worker

In `packages/backend/callback-src/providers/cursorSdkDaemon.ts`:

- Import `callbackSecretsWorkerHandoffEnv` from `../callbackSecrets.js` (next to the `evaMcpWorkerHandoffEnv` import on line 13).
- In `spawnCursorTurnWorker` (lines 190-199), pass the merged handoff:
  ```ts
  const workerEnv = buildCursorTurnWorkerEnv(
    process.env,
    { ...evaMcpWorkerHandoffEnv, ...callbackSecretsWorkerHandoffEnv },
    turn,
    promptFile,
  );
  ```
- Rename the parameter `mcpHandoffEnv` of `buildCursorTurnWorkerEnv` to `trustedHandoffEnv` and update its doc comment (lines 165-171) to say it carries the scrubbed eva MCP variables **and** the Convex callback secrets, both consumed and scrubbed again by the worker at import.

**Verify**: `pnpm --filter @eva/backend typecheck:callback` → exit 0.

### Step 4: Tests

1. Create `packages/backend/callback-src/tests/callbackSecrets.test.ts`, modelled on `callback-src/tests/evaMcp.test.ts`. Use obvious fake values (for example `"test-convex-token"`). Cases:
   - `consumeCallbackSecrets` returns all three values and deletes them from the env object (`expect(env).toEqual({ OTHER: "kept" })` when the input also had `OTHER: "kept"`).
   - It hands off only keys that were present and non-empty (`{ STREAMING_HMAC: "" }` → empty handoff).
   - Integration: set `process.env.CONVEX_TOKEN = "test-convex-token"`, `vi.resetModules()`, `await import("../config.js")`; expect `config.CONVEX_TOKEN` to be `"test-convex-token"` and `process.env.CONVEX_TOKEN` to be `undefined`. Save and restore `process.env` in `afterEach` (copy the pattern from `callback-src/tests/blockingQuestionsGate.test.ts:12-36`).
2. In `packages/backend/callback-src/tests/cursorSdkDaemon.test.ts`, next to the test "hands the scrubbed eva MCP credentials back to the turn worker" (line 165), add a case that passes `{ CONVEX_TOKEN: "test-convex-token" }` in the handoff argument and expects `env.CONVEX_TOKEN` to be `"test-convex-token"`.

**Verify**: `pnpm --filter @eva/backend test -- callback-src/tests/callbackSecrets.test.ts callback-src/tests/cursorSdkDaemon.test.ts callback-src/tests/evaMcp.test.ts` → all pass.

### Step 5: Rebuild the bundle, changelog, final checks

Run `pnpm --filter @eva/backend build:callback`.

Add an entry at the top of `internal/changelog/2026-11.md`, directly under
`# Changelog — November 2026`:

```
## Sandbox Convex token no longer reaches agent processes - <today, YYYY-MM-DD>

- The callback now reads and deletes `CONVEX_TOKEN`, `STREAMING_HMAC` and `HARNESS_CATALOG_TOKEN` at import (`callback-src/callbackSecrets.ts`); `config.ts` re-exports the values.
- The Cursor turn worker gets them back through the same trusted handoff as the eva MCP variables.
- WHY: agents inherit `process.env`, so agent code could read the 24h token and call Convex as the user on every repo they can reach.
```

**Verify**:
- `git diff --stat -- packages/backend/convex/_sandbox_runtime/callbackScript.generated.ts` → file changed.
- `grep -c "callbackSecrets" packages/backend/convex/_sandbox_runtime/callbackScript.generated.ts` → 1 or more.
- `pnpm --filter @eva/backend typecheck` → exit 0.
- `pnpm lint` → exit 0.

Commit: `fix(callback): scrub Convex token and HMAC from agent env`.

### Step 6: Operator step — rotate the signing key (do not do this yourself)

Report to the operator that, after deploy, they should consider rotating the
`SANDBOX_JWT_PRIVATE_KEY` deployment env var (and its matching public JWKS
env var) so that tokens already exposed to agents stop working. VM tokens
live 24 hours, so a rotation also signs out running sandboxes; do it when a
restart of active sandboxes is acceptable. Never print, copy or log either
value.

## Test plan

- `callback-src/tests/callbackSecrets.test.ts` (new): consume-and-delete, empty values, `config.ts` re-export with `process.env` cleared.
- `callback-src/tests/cursorSdkDaemon.test.ts` (extended): worker env gets `CONVEX_TOKEN` back.
- Existing: `callback-src/tests/evaMcp.test.ts` must still pass.
- Command: `pnpm --filter @eva/backend test -- callback-src/tests/callbackSecrets.test.ts callback-src/tests/cursorSdkDaemon.test.ts callback-src/tests/evaMcp.test.ts` → all pass.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` and `typecheck:callback` exit 0
- [ ] The targeted test command in "Test plan" passes
- [ ] `grep -c "callbackSecrets" packages/backend/convex/_sandbox_runtime/callbackScript.generated.ts` ≥ 1
- [ ] `grep -rn "process.env.CONVEX_TOKEN" packages/backend/callback-src --include=*.ts | grep -v /tests/` → no matches
- [ ] `pnpm lint` exits 0
- [ ] `internal/changelog/2026-11.md` has the new entry at the top
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] Operator told to consider rotating `SANDBOX_JWT_PRIVATE_KEY` (name only)
- [ ] `plans/README.md` status row updated, if that file exists

## STOP conditions

Stop and report back (do not improvise) if:

- Any callback code path other than the Cursor turn worker spawns a child process that reads `CONVEX_TOKEN`, `STREAMING_HMAC` or `HARNESS_CATALOG_TOKEN` from its environment (for example a new `spawn(process.execPath, ...)` or `process.argv[1]` re-exec on the callback bundle, or a shell script with `$CONVEX_TOKEN`). Check with `grep -rn "process.execPath\|argv\[1\]\|\$CONVEX_TOKEN" packages/backend/callback-src packages/backend/convex/_sandbox_runtime --include=*.ts | grep -v generated`.
- Something outside `config.ts` reads these keys from `process.env` (the delete would break it), or anything writes `process.env.CONVEX_TOKEN` at runtime (a token refresh would bypass the captured value).
- A module imported by `config.ts` (directly or transitively) reads `CONVEX_TOKEN` from `config.js` during its own module load (an import cycle would see `undefined`).
- `build:callback` changes files other than `callbackScript.generated.ts` and `callback-src/.build/`.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- This is defence in depth only. The daemon's original environment is still readable at `/proc/<daemon pid>/environ` by any process running as the same OS user, which includes agent shells. The same is true for `EVA_MCP_AUTH`. Real isolation needs the agent to run as a different OS user, or the token to be delivered by a file descriptor. Deferred: larger change to the sandbox image.
- `rejectSandboxCaller` blocks only the functions that call it. The VM token can still call every other public function as the user, across all their repos (including `github:getInstallationTokenAction`, see plan 003). A durable fix is a `repoId` (and entity) claim in the VM token, then pinning sandbox identities to that repo in the auth wrappers in `convex/functions.ts`. Deferred because it touches every sandbox-called function.
- Any new Eva-internal secret exported by `launch.ts` for the callback should be added to `CALLBACK_SECRET_KEYS`.
