# Plan 002: Keep the sandbox Convex token out of agent processes and stop it revealing secrets

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` if that file exists — unless a reviewer dispatched you
> and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 2042a0ac7..HEAD -- packages/backend/callback-src/config.ts packages/backend/callback-src/evaMcp.ts packages/backend/callback-src/providers/cursorSdkDaemon.ts packages/backend/callback-src/tests packages/backend/convex/sandboxJwt.ts packages/backend/convex/sandboxAuthConfig.ts packages/backend/convex/auth.config.ts packages/backend/convex/_sandbox_runtime/launch.ts packages/backend/convex/repoEnvVarsActions.ts packages/backend/convex/teamEnvVarsActions.ts packages/backend/convex/userProviderAccountsActions.ts packages/backend/convex/_auth`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: Phase A S, Phase B M (ship Phase A first, as its own commit)
- **Risk**: MED (Phase A touches how the daemon authenticates to Convex; a mistake stops every sandbox turn)
- **Depends on**: none (plan 001 only makes the full suite green; this plan runs targeted tests)
- **Category**: security
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

Every sandbox gets `CONVEX_TOKEN`: a 24-hour ES256 JWT whose subject is the
launching user's Clerk id. Convex accepts it as a full user identity. The
callback daemon keeps it in `process.env`, and every agent provider copies
`process.env` into the agent's environment. So any agent shell command (or
prompt-injected code in the user's repo) can read the token and call any public
Convex function as the user, for example `repoEnvVarsActions.revealValue`, which
decrypts env vars of **every** repo the user can reach, not only the sandbox's
repo. Phase A removes the token (and two other Eva-internal secrets) from the
environment that agents inherit. Phase B makes Convex tell a sandbox identity
from a browser identity and refuses secret reveals to the sandbox. Phase A
alone is not enough: a process running as the same OS user can still read the
daemon's start-up environment from `/proc/<pid>/environ`. Phase B is the real
control.

## Current state

Files and roles:

- `packages/backend/convex/sandboxJwt.ts` — mints the sandbox token (lines 67-73).
- `packages/backend/convex/sandboxAuthConfig.ts` — `SANDBOX_JWT_ISSUER` (line 3-4) and the JWKS data URI.
- `packages/backend/convex/auth.config.ts` — registers the sandbox issuer as a second identity provider beside Clerk.
- `packages/backend/convex/_sandbox_runtime/launch.ts` — writes the runner script that exports the env (line 540 `CONVEX_TOKEN`, line 576 `STREAMING_HMAC`, line 580 `HARNESS_CATALOG_TOKEN`).
- `packages/backend/callback-src/config.ts` — reads the env once at import (lines 5-12).
- `packages/backend/callback-src/evaMcp.ts` — the existing scrub pattern for MCP bearer tokens (lines 64-119).
- `packages/backend/callback-src/providers/cursorSdkDaemon.ts` — spawns a trusted child (the Cursor turn worker) that runs the same callback bundle (lines 174-226).
- `packages/backend/convex/repoEnvVarsActions.ts`, `teamEnvVarsActions.ts`, `userProviderAccountsActions.ts` — public `revealValue` actions that return decrypted secrets.

Token minting, `packages/backend/convex/sandboxJwt.ts:67-73`:

```ts
    const sandboxToken = await new SignJWT({ sub: clerkId })
      .setProtectedHeader({ alg: "ES256", kid })
      .setIssuer(SANDBOX_JWT_ISSUER)
      .setAudience("convex")
      .setExpirationTime("24h")
      .setIssuedAt()
      .sign(key);
```

No repo or sandbox claim. The signing key is the deployment env var
`SANDBOX_JWT_PRIVATE_KEY` (do not read or print its value).

`packages/backend/convex/auth.config.ts` (excerpt):

```ts
    ...(SANDBOX_JWT_JWKS_DATA_URI
      ? [
          {
            type: "customJwt" as const,
            applicationID: "convex",
            issuer: SANDBOX_JWT_ISSUER,
            jwks: SANDBOX_JWT_JWKS_DATA_URI,
            algorithm: "ES256" as const,
          },
        ]
      : []),
```

`packages/backend/convex/sandboxAuthConfig.ts:1-4`:

```ts
const SANDBOX_JWT_FALLBACK_ISSUER = "https://elegant-snail-639.convex.site";

export const SANDBOX_JWT_ISSUER =
  process.env.CONVEX_SITE_URL ?? SANDBOX_JWT_FALLBACK_ISSUER;
```

Callback env capture, `packages/backend/callback-src/config.ts:1-12`:

```ts
import { existsSync } from "fs";
import { hasEvaMcpConfig } from "./evaMcp.js";
import { parseLinkedReposEnv, resolveAgentCwd } from "./linkedRepos.js";

export const CONVEX_URL = process.env.CONVEX_URL;
export const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || CONVEX_URL;
export const CONVEX_TOKEN = process.env.CONVEX_TOKEN;
export const STREAMING_HMAC = process.env.STREAMING_HMAC || "";
/** Short-lived, single-use credential for `/api/harness-skills/report`. */
export const HARNESS_CATALOG_TOKEN = process.env.HARNESS_CATALOG_TOKEN || "";
```

Import-order fact: ES module imports run before the importing module's body.
`config.ts` imports `evaMcp.js` first, and `evaMcp.js` deletes only the MCP
variables, so `config.ts` still sees `CONVEX_TOKEN`. **If you put a delete of
`CONVEX_TOKEN` into any module that `config.ts` imports, and `config.ts` still
reads `process.env.CONVEX_TOKEN`, `config.ts` will read `undefined` and every
Convex call from the sandbox will be unauthenticated.** The design below avoids
this: the new module both reads and deletes, and `config.ts` re-exports its
values.

Only `config.ts` reads these three variables from `process.env` (checked with
`grep -rn "CONVEX_TOKEN\|STREAMING_HMAC\|HARNESS_CATALOG_TOKEN" packages/backend/callback-src`).
No sandbox shell script reads `$CONVEX_TOKEN`. Consumers import from `config.js`:
`http/convexClient.ts:131,177,188,208,242`, `providers/githubToken.ts:104`,
`index.ts:159`, `providers/claudeSdkDaemon.ts:714`.

The existing scrub pattern to copy, `packages/backend/callback-src/evaMcp.ts:64-80` and `108-119`:

```ts
export function consumeEvaMcpEnvironment(env: EvaMcpEnvironment): {
  servers: HttpMcpServers;
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
export const evaMcpServers = consumed.servers;
/**
 * The scrubbed transport variables, re-exported for spawning a trusted child
 * that runs this same callback bundle (the disposable Cursor turn worker). ...
 */
export const evaMcpWorkerHandoffEnv = consumed.workerHandoffEnv;
```

Where agent env is built from `process.env` (all inherit whatever is left):

- `callback-src/providers/claudeSdk.ts:424-425` — `const env: Record<string, string | undefined> = { ...process.env, ...`
- `callback-src/providers/opencodeServer.ts:143` — `env: { ...process.env },`
- `callback-src/providers/codexAppServerClient.ts:37` — `env: { ...process.env, CODEX_HOME: CODEX_RUNTIME_HOME_DIR },`
- `callback-src/providers/codexSdk.ts:50` — `for (const [key, value] of Object.entries(process.env)) {`
- `callback-src/utils.ts:160`, `callback-src/runtime/gitExec.ts:20` — bash/git helpers.

**The one trusted child that legitimately needs `CONVEX_TOKEN`**:
`cursorSdkDaemon.ts:203-219` spawns `process.execPath` on the callback bundle
(`cursorTurnWorkerEntryPath()` = `process.argv[1]`). That worker imports
`config.js` and calls Convex. It gets the MCP variables back through
`buildCursorTurnWorkerEnv(baseEnv, mcpHandoffEnv, turn, promptFile)`
(`cursorSdkDaemon.ts:182-199`). It must get the scrubbed Convex secrets back
the same way, or Cursor turns lose Convex access.

Public reveal actions (no check of who the caller is beyond user access):

`packages/backend/convex/repoEnvVarsActions.ts:10-25`:

```ts
/** Decrypts and reveals the plaintext value of a specific repo env var. */
export const revealValue = action({
  args: {
    repoId: v.id("githubRepos"),
    key: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await getActionRepoWithAccess(ctx, args.repoId);
    ...
    return decryptStoredEntry(vars, args.key);
  },
});
```

`packages/backend/convex/teamEnvVarsActions.ts:10-25` is the same shape with
`assertActionTeamAccess(ctx, args.teamId)`.
`packages/backend/convex/userProviderAccountsActions.ts:65-82` is an
`authAction` that returns a decrypted AI provider credential.
The web app calls all three: `apps/web/src/routes/_repo/$owner/$repo/settings/EnvVariablesClient.tsx:14`,
`apps/web/src/routes/_global/teams/_components/TeamEnvVarsTab.tsx:17`,
`apps/web/src/lib/components/accounts/AddAccountDialog.tsx:76`. No sandbox code
calls them (`grep -rn revealValue packages/backend/callback-src` is empty).

Convex exposes the token issuer on the identity: `ctx.auth.getUserIdentity()`
returns a `UserIdentity` with `issuer` (and `subject`). For a sandbox token the
issuer is exactly the `SANDBOX_JWT_ISSUER` string that `sandboxJwt.ts` signed.

Other decrypt sites were checked and are internal-only or behind a deploy key:
`_connectors/oauth.ts`, `_github/userAuth.ts`, `usageLimitsActions.ts`,
`grokBotActions.ts`, `mcp/routes.ts` (`/api/mcp/env-vars` checks `verifyDeployKey`).

### Conventions (quoted from `/tmp/repo/CLAUDE.md` and `docs/eva-convex.md`)

- "No `any`, `unknown`, `as`, or non-null `!`. No `isRecord(object: unknown)` — parse at the boundary (Zod). Hard types → rethink design."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary."
- "Eliminate duplication, centralise your changes so its easier to update them"
- "After medium+ changes: no banned types; `tsc` where relevant; `/changelog` (or `internal/changelog.md`)."
- From `docs/eva-convex.md`: "Avoid importing `process.env` helpers into Convex isolate workflow files. If something needs env vars, keep it in `"use node"` actions." (The three reveal files are `"use node"`.)
- Callback source only reaches sandboxes through the generated bundle. `tests/callbackBundleModuleContract.test.ts` fails if a new `callback-src` module is missing from `convex/_sandbox_runtime/callbackScript.generated.ts`. Rebuild with `pnpm --filter @eva/backend build:callback` (local esbuild only).
- Changelog format in `internal/changelog.md`: newest entry at the top as `## <Title>`, blank line, `Date: YYYY-MM-DD`, blank line, `WHY: <summary>`.

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Callback typecheck | `pnpm --filter @eva/backend typecheck:callback` | exit 0 |
| Convex typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Rebuild callback bundle | `pnpm --filter @eva/backend build:callback` | exit 0; `convex/_sandbox_runtime/callbackScript.generated.ts` changes |
| Targeted tests | `pnpm --filter @eva/backend test -- <path relative to packages/backend>` | all pass |
| Lint | `pnpm lint` | exit 0 |
| Schema check | `node scripts/check-schema-narrowing.mjs` | exit 0 |

Run only the targeted test files listed in each step. As of planning, 5 backend
tests fail already (`callback-src/tests/pendingQuestion.test.ts`,
`tests/sessionStopRecoveryContract.test.ts` x3,
`tests/providerAccountHandoffContract.test.ts`); they are fixed by plan 001 and
are not yours to fix. NEVER run `npx convex codegen`, `convex dev` or
`convex deploy` — they upload to the linked deployment.

## Suggested executor toolkit

- `convex-setup-auth` skill, if available, for how Convex identities and issuers work.
- Read `packages/backend/callback-src/tests/evaMcp.test.ts` and `packages/backend/tests/artifactState.test.ts` before writing tests.

## Scope

**In scope**:

Phase A:
- `packages/backend/callback-src/callbackSecrets.ts` (create)
- `packages/backend/callback-src/config.ts`
- `packages/backend/callback-src/providers/cursorSdkDaemon.ts`
- `packages/backend/callback-src/tests/callbackSecrets.test.ts` (create)
- `packages/backend/callback-src/tests/cursorSdkDaemon.test.ts`
- `packages/backend/convex/_sandbox_runtime/callbackScript.generated.ts` (regenerated only, never hand-edited)

Phase B:
- `packages/backend/convex/_auth/sandboxIdentity.ts` (create)
- `packages/backend/convex/repoEnvVarsActions.ts`
- `packages/backend/convex/teamEnvVarsActions.ts`
- `packages/backend/convex/userProviderAccountsActions.ts`
- `packages/backend/tests/sandboxIdentityReveal.test.ts` (create)
- `internal/changelog.md`

**Out of scope** (do NOT touch):

- `convex/sandboxJwt.ts` and `convex/auth.config.ts` — changing the token format or provider list breaks running sandboxes; adding a repo claim is a follow-up (see Maintenance notes).
- `convex/_sandbox_runtime/launch.ts` — keep exporting the variables; the callback needs them at start-up.
- `callback-src/evaMcp.ts` — already correct; do not merge it with the new module.
- AI provider credentials in the env (`CODEX_AUTH_JSON_BASE64`, `OPENCODE_AUTH_JSON_BASE64`, Claude credentials) and `GITHUB_TOKEN`/`GH_TOKEN` — agents need these to work. GitHub token scope is plan 003.
- `github:getInstallationTokenAction` — the daemon calls it with the sandbox token; do not block it here (plan 003 scopes it).
- Any `upsertVar` action — a write, not a reveal; out of this plan.

## Git workflow

- Work on the current branch the operator gives you. Do not create a branch, push or open a PR unless told.
- Two commits, Phase A first. Style (see `git log --oneline -10`): conventional, for example `refactor(chat): one sandbox chat module for tasks and projects (#1097)`.
  - `fix(callback): scrub Convex token and HMAC from agent env`
  - `fix(backend): refuse secret reveals to sandbox identities`

## Steps

### Phase A — scrub Eva-internal secrets from the agent environment

#### Step A1: Create `callback-src/callbackSecrets.ts`

Model it on `consumeEvaMcpEnvironment` in `evaMcp.ts`. Target shape (no `as`,
no `as const`):

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

`HARNESS_CATALOG_SANDBOX_ID` is an id, not a secret; leave it in `config.ts` as is.

**Verify**: `pnpm --filter @eva/backend typecheck:callback` → exit 0.

#### Step A2: Make `config.ts` re-export the captured values

In `packages/backend/callback-src/config.ts`, add
`import { callbackSecrets } from "./callbackSecrets.js";` with the other imports,
and change lines 7, 8 and 10 to:

```ts
export const CONVEX_TOKEN = callbackSecrets.CONVEX_TOKEN;
export const STREAMING_HMAC = callbackSecrets.STREAMING_HMAC || "";
/** Short-lived, single-use credential for `/api/harness-skills/report`. */
export const HARNESS_CATALOG_TOKEN = callbackSecrets.HARNESS_CATALOG_TOKEN || "";
```

The exported names and types must not change, so no consumer changes.

**Verify**:
- `pnpm --filter @eva/backend typecheck:callback` → exit 0.
- `grep -rn "process.env.CONVEX_TOKEN\|process.env.STREAMING_HMAC\|process.env.HARNESS_CATALOG_TOKEN" packages/backend/callback-src --include=*.ts | grep -v /tests/` → only matches inside `callbackSecrets.ts` (or none, since it uses `env[key]`).

#### Step A3: Hand the secrets back to the Cursor turn worker

In `packages/backend/callback-src/providers/cursorSdkDaemon.ts`:

- Import `callbackSecretsWorkerHandoffEnv` from `../callbackSecrets.js`.
- In `spawnCursorTurnWorker` (line ~203), pass the merged handoff:
  ```ts
  const workerEnv = buildCursorTurnWorkerEnv(
    process.env,
    { ...evaMcpWorkerHandoffEnv, ...callbackSecretsWorkerHandoffEnv },
    turn,
    promptFile,
  );
  ```
- Rename the parameter `mcpHandoffEnv` of `buildCursorTurnWorkerEnv` to `trustedHandoffEnv` and update its doc comment (lines 175-181) to say it carries the scrubbed eva MCP variables **and** the Convex callback secrets, both consumed and scrubbed again by the worker at import.

**Verify**: `pnpm --filter @eva/backend typecheck:callback` → exit 0.

#### Step A4: Tests for Phase A

1. Create `packages/backend/callback-src/tests/callbackSecrets.test.ts`, modelled on `callback-src/tests/evaMcp.test.ts`. Use obvious fake values (for example `"test-convex-token"`). Cases:
   - `consumeCallbackSecrets` returns all three values and deletes them from the env object (`expect(env).toEqual({ OTHER: "kept" })` when the input also had `OTHER: "kept"`).
   - It hands off only keys that were present and non-empty (`{ STREAMING_HMAC: "" }` → empty handoff).
   - Integration: set `process.env.CONVEX_TOKEN = "test-convex-token"`, `vi.resetModules()`, `await import("../config.js")`; expect `config.CONVEX_TOKEN` to be `"test-convex-token"` and `process.env.CONVEX_TOKEN` to be `undefined`. Restore `process.env` in `afterEach` (copy the restore pattern from `callback-src/tests/blockingQuestionsGate.test.ts:31-36`).
2. In `packages/backend/callback-src/tests/cursorSdkDaemon.test.ts`, next to the test "hands the scrubbed eva MCP credentials back to the turn worker" (line ~168), add a case that passes `{ CONVEX_TOKEN: "test-convex-token" }` in the handoff argument and expects `env.CONVEX_TOKEN` to be `"test-convex-token"`.

**Verify**: `pnpm --filter @eva/backend test -- callback-src/tests/callbackSecrets.test.ts callback-src/tests/cursorSdkDaemon.test.ts callback-src/tests/evaMcp.test.ts` → all pass.

#### Step A5: Rebuild the bundle and commit Phase A

Run `pnpm --filter @eva/backend build:callback`.

**Verify**:
- `git diff --stat -- packages/backend/convex/_sandbox_runtime/callbackScript.generated.ts` → file changed.
- `grep -c "callback-src/callbackSecrets.ts" packages/backend/convex/_sandbox_runtime/callbackScript.generated.ts` → 1 or more.
- `pnpm --filter @eva/backend test -- tests/callbackBundleModuleContract.test.ts` → all pass.
- `pnpm --filter @eva/backend typecheck` → exit 0.

Commit: `fix(callback): scrub Convex token and HMAC from agent env`.

### Phase B — refuse secret reveals to sandbox identities

#### Step B1: Create `convex/_auth/sandboxIdentity.ts`

```ts
import type { Auth, UserIdentity } from "convex/server";
import { SANDBOX_JWT_ISSUER } from "../sandboxAuthConfig";

/** True when the caller authenticated with the sandbox JWT, not Clerk. */
export function isSandboxIdentity(identity: UserIdentity | null): boolean {
  return identity !== null && identity.issuer === SANDBOX_JWT_ISSUER;
}

/**
 * Secret reveals are for a person in the browser. A sandbox token acts as its
 * user for every repo they can reach, so code in one repo's sandbox must not
 * decrypt another repo's (or any) stored secret through these actions.
 */
export async function assertNotSandboxCaller(ctx: { auth: Auth }): Promise<void> {
  if (isSandboxIdentity(await ctx.auth.getUserIdentity())) {
    throw new Error("Secret values cannot be revealed from a sandbox.");
  }
}
```

If `Auth` or `UserIdentity` is not exported from `convex/server` in this
Convex version, find where `ctx.auth` is typed (`grep -rn "UserIdentity" node_modules/convex/dist/esm-types/server/authentication.d.ts`) and import from there. Do not use `as`.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

#### Step B2: Call the guard first in the three reveal actions

Add `await assertNotSandboxCaller(ctx);` as the **first** line of the handler in:

- `convex/repoEnvVarsActions.ts` `revealValue` (before `getActionRepoWithAccess`)
- `convex/teamEnvVarsActions.ts` `revealValue` (before `assertActionTeamAccess`)
- `convex/userProviderAccountsActions.ts` `revealValue` (before the account lookup)

Import it as `import { assertNotSandboxCaller } from "./_auth/sandboxIdentity";`.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

#### Step B3: convex-test coverage

Create `packages/backend/tests/sandboxIdentityReveal.test.ts`. Follow
`packages/backend/tests/artifactState.test.ts` (`convexTest(schema, modules)`,
`const modules = import.meta.glob("../convex/**/*.ts")`, a `fixture()`
function, `TIMEOUT_MS = 30_000`).

Fixture: insert a `users` row with `clerkId: "clerk|reveal-owner"`, a
`githubRepos` row (`owner`, `name`, `installationId: 1`, `connectedBy: userId`),
and a `repoEnvVars` row (`repoId`, `vars: [{ key: "API_KEY", value: "plain-test-value" }]`, `updatedAt: Date.now()`).
A value without the `enc:` prefix passes through `decryptValue` unchanged, so no
`ENCRYPTION_KEY` is needed. Also a `teams` row, a `teamMembers` row for the user
(`role: "member"`, `joinedAt`), and a `teamEnvVars` row the same way.

Cases:
- Clerk identity (`t.withIdentity({ subject: "clerk|reveal-owner", issuer: "https://clerk.test.example" })`) → `api.repoEnvVarsActions.revealValue` returns `"plain-test-value"`.
- Sandbox identity (`t.withIdentity({ subject: "clerk|reveal-owner", issuer: SANDBOX_JWT_ISSUER })`, importing `SANDBOX_JWT_ISSUER` from `../convex/sandboxAuthConfig`) → `revealValue` rejects with `/cannot be revealed from a sandbox/`.
- Same pair for `api.teamEnvVarsActions.revealValue`.
- A unit test of `isSandboxIdentity(null)` → `false`.

**Verify**: `pnpm --filter @eva/backend test -- tests/sandboxIdentityReveal.test.ts` → all pass (5 or more tests).

#### Step B4: Final checks, changelog, commit

Add at the top of `internal/changelog.md` (under `# Changelog`):

```
## Sandbox token no longer reaches agents or reveals secrets

Date: <today, YYYY-MM-DD>

WHY: The sandbox CONVEX_TOKEN acts as the user on every repo they can reach. Agents inherited it through process.env, so agent code could decrypt env vars of other repos via revealValue. The callback now consumes and deletes CONVEX_TOKEN, STREAMING_HMAC and HARNESS_CATALOG_TOKEN at import (handing them only to the Cursor turn worker), and the three revealValue actions reject identities from the sandbox issuer.
```

**Verify**:
- `pnpm --filter @eva/backend typecheck` → exit 0
- `pnpm --filter @eva/backend typecheck:callback` → exit 0
- `pnpm --filter @eva/web typecheck` → exit 0 (web calls these actions; signatures did not change)
- `pnpm lint` → exit 0
- `node scripts/check-schema-narrowing.mjs` → exit 0
- `git diff 2042a0ac7 --name-only` lists only in-scope files.

Commit: `fix(backend): refuse secret reveals to sandbox identities`.

#### Step B5: Operator step — rotate the signing key (do not do this yourself)

Report to the operator that, after deploy, they should rotate the
`SANDBOX_JWT_PRIVATE_KEY` deployment env var (and its matching public
`SANDBOX_JWT_JWKS`) so that tokens already exposed to agents stop working.
Tokens live 24 hours, so a rotation also signs out running sandboxes; the
operator should do it when a restart of active sandboxes is acceptable. Never
print, copy or log either value.

## Test plan

- `callback-src/tests/callbackSecrets.test.ts` (new): consume-and-delete, empty values, `config.ts` re-export with `process.env` cleared.
- `callback-src/tests/cursorSdkDaemon.test.ts` (extended): worker env gets `CONVEX_TOKEN` back.
- `tests/sandboxIdentityReveal.test.ts` (new): Clerk identity reveals; sandbox identity is refused, for repo and team env vars.
- Existing: `callback-src/tests/evaMcp.test.ts`, `tests/callbackBundleModuleContract.test.ts` must still pass.
- Command: `pnpm --filter @eva/backend test -- callback-src/tests/callbackSecrets.test.ts callback-src/tests/cursorSdkDaemon.test.ts callback-src/tests/evaMcp.test.ts tests/callbackBundleModuleContract.test.ts tests/sandboxIdentityReveal.test.ts` → all pass.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` and `typecheck:callback` exit 0
- [ ] `pnpm --filter @eva/web typecheck` exits 0
- [ ] The targeted test command in "Test plan" passes
- [ ] `grep -c "callback-src/callbackSecrets.ts" packages/backend/convex/_sandbox_runtime/callbackScript.generated.ts` ≥ 1
- [ ] `grep -n "assertNotSandboxCaller" packages/backend/convex/repoEnvVarsActions.ts packages/backend/convex/teamEnvVarsActions.ts packages/backend/convex/userProviderAccountsActions.ts` → 3 call sites (plus imports)
- [ ] `pnpm lint` exits 0
- [ ] `internal/changelog.md` has the new entry at the top
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] Operator told to rotate `SANDBOX_JWT_PRIVATE_KEY` (name only)
- [ ] `plans/README.md` status row updated, if that file exists

## STOP conditions

Stop and report back (do not improvise) if:

- Any callback code path other than the Cursor turn worker spawns a child process that reads `CONVEX_TOKEN`, `STREAMING_HMAC` or `HARNESS_CATALOG_TOKEN` from its environment (for example a new `spawn(process.execPath, ...)` on the callback bundle, or a shell script with `$CONVEX_TOKEN`). Check with `grep -rn "process.execPath\|\$CONVEX_TOKEN" packages/backend/callback-src packages/backend/convex/_sandbox_runtime`.
- Something outside `config.ts` reads these keys from `process.env` (the delete would break it).
- `identity.issuer` is not available on the Convex `UserIdentity` type, or the Clerk provider's issuer could equal `SANDBOX_JWT_ISSUER`.
- A sandbox-side caller of any `revealValue` action is found (`grep -rn revealValue packages/backend/callback-src packages/backend/convex/_sandbox_runtime`).
- `build:callback` changes files other than `callbackScript.generated.ts` (and the annotation bundle if the script also builds it).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Phase A is defence in depth only. The daemon's original environment is still readable at `/proc/<daemon pid>/environ` by any process running as the same OS user, which includes agent shells. The same is true today for `EVA_MCP_AUTH`. Real isolation needs the agent to run as a different OS user, or the token to be delivered by a file descriptor. Deferred: larger change to the sandbox image.
- Phase B blocks only the three reveal actions. The sandbox token can still call every other public function as the user, across all their repos (including `github:getInstallationTokenAction` for any of the user's repos). A durable fix is a `repoId` (and entity) claim in the sandbox JWT, then pinning sandbox identities to that repo in `getActionRepoWithAccess` and the auth wrappers in `convex/functions.ts`. Deferred because it touches every sandbox-called function.
- If a new public action returns a decrypted secret, call `assertNotSandboxCaller` first. A reviewer should grep for `decrypt` in new `action(`/`authAction(` exports.
- If the sandbox issuer ever changes (for example `CONVEX_SITE_URL` changes), `SANDBOX_JWT_ISSUER` still matches because both the signer and the guard read the same constant.
