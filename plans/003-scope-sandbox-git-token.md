# Plan 003: Scope every GitHub token a sandbox receives to the repository it works on

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` if that file exists — unless a reviewer dispatched you
> and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 478be7912..HEAD -- packages/backend/convex/githubAuth.ts packages/backend/convex/sandboxGitCredentials.ts packages/backend/convex/http.ts packages/backend/convex/_github/api.ts packages/backend/convex/_sandbox_runtime/git.ts packages/backend/tests/sandboxSiblingReadAccess.test.ts docs/multi-repo-sessions.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (a wrong scope breaks clone, push or `gh pr create` in sandboxes)
- **Depends on**: none (plan 002 is related: it removes `CONVEX_TOKEN` from agent env, which limits who can call `getInstallationTokenAction`)
- **Category**: security
- **Planned at**: commit `478be7912`, 2026-11-12
- Refreshed: 2026-11-12 (was planned at 2042a0ac7)

## Why this matters

A GitHub App installation often covers many repositories (a whole org). Today
a sandbox gets installation-wide GitHub tokens from five places. Agent code
in the sandbox can read them (`GITHUB_TOKEN`/`GH_TOKEN` are in its
environment) and use them to read or push to **every** repository in the
installation, not only the one the user connected to Eva. The code already
scopes tokens for "sibling" repositories to one repository; the home
repository, the linked repository, the no-path helper request, the daemon's
`GH_TOKEN` refresh, the env file and the clone do not. After this plan, every
token handed into a sandbox names exactly one repository (`repositoryIds` or
`repositoryNames`), so the blast radius of a leaked sandbox token is one repo.
Permission narrowing (contents/pull requests only) is a second, optional step
gated on operator confirmation, because the needed set is not fully provable
from code.

## Current state

### Where installation-wide tokens enter a sandbox (verified at `478be7912`)

1. `/api/git-credentials` home and linked requests — `convex/http.ts:287-334`; the final call at lines 327-330 is `internal.githubAuth.mintInstallationToken` (no repository scope).
2. The no-path request — `convex/sandboxGitCredentials.ts:170-176` returns `kind: "home"` for the whole installation.
3. The daemon's `GH_TOKEN` refresh — `callback-src/providers/githubToken.ts:40-59` calls the public action `github:getInstallationTokenAction` (re-exported by `convex/github.ts:4`) with the sandbox `CONVEX_TOKEN`; `convex/_github/api.ts:27-36` returns `getInstallationToken(repo.installationId)` (installation-wide). The callback writes it to `GITHUB_TOKEN`/`GH_TOKEN` (`githubToken.ts:62-68`, `94`), and agents inherit it. Called at one-shot start (`index.ts:154`), from the daemon loop (`runtime/daemonProcess.ts:312`) and per Cursor turn (`providers/cursorSdkDaemon.ts:460`).
4. The sandbox env file at create — `convex/_sandbox_runtime/git.ts:427` `getInstallationToken(installationId)`, written as `GITHUB_TOKEN: token` at `git.ts:489`.
5. Clone — `convex/_sandbox_runtime/git.ts:1156` `getInstallationToken(installationId)` inside `cloneRepoInto`, passed to `sandbox.git.clone`.

Server-side callers (`getInstallationOctokit` at `githubAuth.ts:95-101`,
`getRepoOctokit` at `:106-116`) never hand the token to a sandbox. Out of
scope.

### Token helpers, `packages/backend/convex/githubAuth.ts`

Lines 61-70 (installation-wide, cached by `createAppAuth`):

```ts
/** Short-lived access token for a GitHub App installation (cached per process). */
export async function getInstallationToken(
  installationId: number,
): Promise<string> {
  const installationAuth = await appAuth()({
    type: "installation",
    installationId,
  });
  return installationAuth.token;
}
```

Lines 80-93 (the scoped pattern to reuse):

```ts
function siblingRepoInstallationAuth(
  installationId: number,
  repo: { githubId: number | undefined; name: string },
) {
  return appAuth()({
    type: "installation",
    installationId,
    permissions: { contents: "write", metadata: "read" },
    ...(repo.githubId !== undefined
      ? { repositoryIds: [repo.githubId] }
      : { repositoryNames: [repo.name] }),
  });
}
```

Lines 144-156:

```ts
/** Internal action wrapper so HTTP actions can mint an installation token via ctx.runAction. */
export const mintInstallationToken = internalAction({
  args: { installationId: v.number() },
  returns: sandboxGitCredentialValidator,
  handler: async (_ctx, args) => {
    return toSandboxGitCredential(
      await appAuth()({
        type: "installation",
        installationId: args.installationId,
      }),
    );
  },
});
```

`mintSiblingRepoToken` (lines 158-174) takes
`{ installationId: v.number(), githubId: v.optional(v.number()), name: v.string() }`.
`mintInstallationToken` has one caller: `convex/http.ts:328`. The
`createAppAuth` cache (comment at `githubAuth.ts:50-54`) keys by
installation, permissions **and repositories**, so scoped tokens cache
correctly. `@octokit/auth-app` accepts `repositoryIds?: number[]` or
`repositoryNames?: string[]`. Repository names are unique within one
installation (an installation belongs to one account).

### Credential decision, `packages/backend/convex/sandboxGitCredentials.ts:141-244`

```ts
export const resolveCredentialRequest = internalQuery({
  args: { secret: v.string(), path: v.optional(v.string()) },
  returns: v.union(
    v.object({ kind: v.literal("home"), installationId: v.number() }),
    v.object({ kind: v.literal("linked"), installationId: v.number(), owner: v.string(), name: v.string(), sandboxId: v.string() }),
    v.object({ kind: v.literal("sibling"), ... githubId: v.optional(v.number()), ... }),
    v.object({ kind: v.literal("denied"), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const row = ...by_secret...;
    if (!row) return { kind: "denied" as const, reason: "unknown secret" };

    // No path: an old baked helper script, or a fetch from before
    // `useHttpPath` rolled out. Mint for the sandbox's primary installation.
    const requested =
      args.path === undefined ? null : parseRepoPath(args.path);
    if (!requested) {
      return { kind: "home" as const, installationId: row.installationId };
    }

    // Rows written before the pin fall through to the entity's repository.
    const pinned = pinnedHomeRepo(row);
    if (pinned && isSameGitHubRepo(pinned, requested)) {
      return { kind: "home" as const, installationId: row.installationId };
    }

    const entity = await lookupSandboxOwner(ctx.db, row.sandboxId);
    ...
    const homeRepo = await ctx.db.get(entity.repoId);
    ...
    if (isSameGitHubRepo(homeRepo, requested)) {
      return { kind: "home" as const, installationId: row.installationId };
    }
    // linked (lines 207-218) and sibling (220-243) follow
```

- `pinnedHomeRepo(row)` (lines 74-79) returns `{ owner, name }` from `row.repoOwner`/`row.repoName`, or null on rows written before the pin. Every current helper install pins it (`_sandbox_runtime/gitCredentials.ts:170-178`).
- `lookupSandboxOwner` (lines 82-103) now looks up **sessions only** (by `sandboxId`). Tasks and projects run on hidden owned sessions (`sessions.owner`), so their sandboxes resolve through the session.
- `githubRepos` rows have `githubId: v.optional(v.number())` (`_validators/tableFields.ts:1055`). `sessionRepos` rows (linked repos) have `owner`, `name`, `installationId` but no `githubId` (`tableFields.ts:894-914`).
- The doc comment on `resolveCredentialRequest` (lines 122-140) says "No path, or the sandbox's own home repository, keeps the historical behaviour: a full installation token. A linked repo of a multi-repo session gets a full token too".

### HTTP route, `packages/backend/convex/http.ts:272-334`

Body comment (lines 272-278): "absent for an old baked helper script, which
still gets a primary token". End of handler (lines 318-333):

```ts
    if (resolved.kind === "linked") {
      // A multi-repo session's linked repo: a full token, but for that repo's
      // own installation rather than the primary's.
      console.log(`[git-credentials][linked-repo] ...`);
    }

    const credential = await ctx.runAction(
      internal.githubAuth.mintInstallationToken,
      { installationId: resolved.installationId },
    );
    // `expiresAt` (unix seconds) bounds the helper's cache; see gitCredentials.ts.
    return Response.json({ username: "x-access-token", ...credential });
```

### Public token action, `packages/backend/convex/_github/api.ts:27-36`

```ts
/** Returns a short-lived installation token for a given GitHub repo's app installation. */
export const getInstallationTokenAction = action({
  args: { repoId: v.id("githubRepos") },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const repo = await getActionRepoWithAccess(ctx, args.repoId);
    const token = await getInstallationToken(repo.installationId);
    return { token };
  },
});
```

Import at line 8: `import { getInstallationOctokit, getInstallationToken } from "../githubAuth";`.
No web caller (`grep -rn getInstallationTokenAction apps` is empty). The
sandbox callback calls it by the string path `github:getInstallationTokenAction`;
keep the name.

### `createSandbox` and clone, `packages/backend/convex/_sandbox_runtime/git.ts`

- `createSandbox(client, installationId, sandboxEnvVars, lifecycle, snapshotName?, readyTimeoutSeconds?, onSandboxAcquired?, forkFrom?, driveCacheRole?)` (line 382) has no repository argument. Its only callers are in `createSandboxAndPrepareRepo(ctx, client, installationId, owner, name, ...)` (line 1818) at lines 1862 and 1881, which know `owner`/`name`.
- `cloneRepoInto(sandbox, installationId, owner, name, destDir, onProgress?)` (line 1147) knows `owner`/`name`. Callers: `git.ts:1196` (`cloneAndSetupRepo`, primary), `_sandbox_runtime/linkedRepos.ts:154` (linked repo, its own installation) and `_repoGroups/snapshotBuild.ts:77` (group snapshot builder, one repo per call). Each call clones one repository.
- Import at line 11: `import { getInstallationToken } from "../githubAuth";`.

### What sandboxes do with GitHub (for the permission question)

- `git clone`, `git fetch`, `git push` (contents).
- Session prompt tells the agent to push a side branch and run `gh pr create`: `convex/_sessions/prompts.ts:60` and `:192` (pull requests write).
- MCP tool text tells the agent to run `gh pr checks`: `convex/mcp/chatSelfTools.ts:712` (checks/actions/statuses read).
- Task, automation, evaluation and test-gen prompts say "Do NOT run git push or gh pr commands" (`_taskWorkflow/prompts.ts:91`, `:121`; `_automationWorkflow/prompts.ts:31`; `evaluationWorkflow.ts:554`; `testGenWorkflow.ts:266`).
- An agent can edit `.github/workflows/*`; GitHub rejects such a push unless the token has `workflows: write`.
- Linked repo branches are pushed in the sandbox by `internal.sandbox.pushLinkedRepoBranches` (through the credential helper with a path, so a `linked` token); their PRs are opened server-side (`docs/multi-repo-sessions.md:113`).

### Multi-repo sessions (from `docs/multi-repo-sessions.md:72-81`)

> - The in-sandbox helper sets `git config --global credential.useHttpPath true`, reads `path=` from git's stdin, sanitises it, and POSTs `{ "path": "<owner>/<name>.git" }` to `/api/git-credentials`.
> - The route (`http.ts`) parses the path, looks the repo's `installationId` up by owner/name, and mints only when that id is in the sandbox's allow-list — otherwise **403**. A request with no path (old helper scripts baked into snapshots) falls back to the primary installation. Pure decisions live in `_sandbox_runtime/gitCredentialsPath.ts`.
> - The helper's token cache file is keyed by a hash of the repository path (`/tmp/git-cred-cache-<hash>`), so a cache hit for one repo can never serve another repo's token.

So git in a linked repo goes through the helper with a path and gets a
"linked" token; scoping that token to the linked repo keeps it working.
`GH_TOKEN` (env) is single-valued; after this plan it covers the primary repo
only.

### Existing tests that pin today's shape

`packages/backend/tests/sandboxSiblingReadAccess.test.ts` calls
`internal.sandboxGitCredentials.resolveCredentialRequest` through a
`resolve(t, path?, secret?)` helper (lines 125-134) and asserts the home
shape with `toEqual`, for example (lines 136-140):

```ts
describe("resolveCredentialRequest — home repository", () => {
  test("no path keeps today's full installation token", async () => {
    const { t } = await fixture({});
    expect(await resolve(t)).toEqual({ kind: "home", installationId: 1 });
  });
```

Its `fixture()` home repo is `vvedantb/eva`, `installationId: 1`,
`githubId: 111`, bound through a session with `sandboxId: "sbx_home"`; the
credential row has no pin. `orphanFixture({ pinHome })` (lines 258-273) has
no session and optionally pins `repoOwner`/`repoName`. Every `toEqual({ kind: "home", ... })`
in this file (lines 139, 144, 154, 281, 313, 330, 350) must be updated
to the new shape.

### Conventions (quoted from `/tmp/repo/CLAUDE.md`, `docs/eva-convex.md`)

- "No `any`, `unknown`, `as`, or non-null `!`. No `isRecord(object: unknown)` — parse at the boundary (Zod)."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary."
- "Eliminate duplication, centralise your changes so its easier to update them"
- `docs/eva-convex.md`: "Never manually define interfaces for Convex documents. Always import: `Doc<"tableName">`, `Id<"fieldName">`"; keep `process.env` helpers in `"use node"` actions. (`githubAuth.ts` and `_github/api.ts` are `"use node"`; `sandboxGitCredentials.ts` and `http.ts` are not — do not import `githubAuth.ts` into them; call it via `ctx.runAction(internal.githubAuth.*)` as today.)
- Tests must exercise behaviour. The lint rule `eva/no-source-text-in-tests` bans tests that read source files as text.
- Changelog: `internal/changelog/README.md` — new entries go at the top of `internal/changelog/2026-11.md`, directly under `# Changelog — November 2026`, as `## <Title> - <YYYY-MM-DD>` followed by bullets (what changed and why).

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Convex typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Targeted tests | `pnpm --filter @eva/backend test -- <path relative to packages/backend>` | all pass |
| Lint | `pnpm lint` | exit 0 |

Run only the targeted test files listed below. At planning time 2 backend
tests in `tests/sessionChatTabs.test.ts` fail; they are not yours. NEVER run
`npx convex codegen`, `convex dev` or `convex deploy`. New exports in an
existing Convex module need no codegen (`convex/_generated/api.d.ts:440`
and `:1018` type the module as `typeof import("../githubAuth.js")`). This
plan adds no new Convex module file.

## Suggested executor toolkit

- `security-audit` skill, if available, for a second look at the final diff.
- Read `packages/backend/tests/sandboxSiblingReadAccess.test.ts` in full before Step 6.

## Scope

**In scope**:

- `packages/backend/convex/githubAuth.ts`
- `packages/backend/convex/sandboxGitCredentials.ts`
- `packages/backend/convex/http.ts` (only the `/api/git-credentials` handler and its body comment)
- `packages/backend/convex/_github/api.ts` (only `getInstallationTokenAction` and its import)
- `packages/backend/convex/_sandbox_runtime/git.ts` (only `createSandbox`, its two call sites, `cloneRepoInto`, and the import)
- `packages/backend/tests/sandboxSiblingReadAccess.test.ts`
- `docs/multi-repo-sessions.md` (the "Git auth across installations" bullets)
- `internal/changelog/2026-11.md`

**Out of scope** (do NOT touch):

- `getInstallationToken`, `getInstallationOctokit`, `getRepoOctokit` — server-side; tokens never enter a sandbox.
- `convex/_sandbox_runtime/gitCredentials.ts` helper script — the client side is fine; changing it means re-baking snapshots.
- `callback-src/**` — the callback stores whatever token the action returns; no change, no bundle rebuild.
- The `sibling` branch logic and its permissions.
- Any change to the `sandboxGitCredentials` table schema.

## Git workflow

- Work on the current branch. Do not create a branch, push or open a PR unless told.
- Conventional commits (see `git log --oneline -10`, e.g. `fix(github): stop late PR webhooks from reopening a merged PR`). Commit after Step 6: `fix(backend): scope sandbox GitHub tokens to one repository`. Step 7 (permissions) is a separate commit only if the operator approves it.

## Steps

### Step 1: Add one repository-scoped mint in `githubAuth.ts`

In `packages/backend/convex/githubAuth.ts`:

1. Add a shared scope helper and use it in `siblingRepoInstallationAuth` (removes the duplicated ternary):
   ```ts
   /** One GitHub repository inside an installation. */
   type RepoScope = { githubId: number | undefined; name: string };

   function repositoryScope(repo: RepoScope) {
     return repo.githubId !== undefined
       ? { repositoryIds: [repo.githubId] }
       : { repositoryNames: [repo.name] };
   }
   ```
2. Add a repository-scoped auth that keeps the App's own permissions (no `permissions` key — narrowing is Step 7):
   ```ts
   /**
    * Token for exactly one repository, with the App's permissions. Every token
    * that enters a sandbox for its own (or a linked) repository uses this, so
    * a leaked token cannot reach the rest of the installation.
    */
   function repoInstallationAuth(installationId: number, repo: RepoScope) {
     return appAuth()({
       type: "installation",
       installationId,
       ...repositoryScope(repo),
     });
   }

   /** Node-side callers that need only the token string. */
   export async function getRepoInstallationToken(
     installationId: number,
     repo: RepoScope,
   ): Promise<string> {
     return (await repoInstallationAuth(installationId, repo)).token;
   }
   ```
3. Replace `mintInstallationToken` (lines 144-156) with `mintRepoToken` (same args as `mintSiblingRepoToken`; same `returns`), whose handler returns `toSandboxGitCredential(await repoInstallationAuth(args.installationId, { githubId: args.githubId, name: args.name }))`.

Leave `getInstallationToken` in place; `getInstallationOctokit` still uses it.

**Verify**: `pnpm --filter @eva/backend typecheck` → errors only at `convex/http.ts` (`mintInstallationToken` no longer exists). Any other error → fix in this file. If the error says `internal.githubAuth.mintRepoToken` does not exist, see STOP conditions.

### Step 2: Make every "home" decision name the home repository

In `packages/backend/convex/sandboxGitCredentials.ts`:

1. Change the `home` member of the `returns` union (line 144) to:
   ```ts
   v.object({
     kind: v.literal("home"),
     installationId: v.number(),
     name: v.string(),
     githubId: v.optional(v.number()),
   }),
   ```
2. Rewrite the start of the handler (lines 170-182) so a missing or unparsable path is **the home repository only**, never the whole installation:
   - `const requested = args.path === undefined ? null : parseRepoPath(args.path);`
   - `const pinned = pinnedHomeRepo(row);`
   - If `!requested`:
     - if `pinned` → `return { kind: "home" as const, installationId: row.installationId, name: pinned.name };`
     - else load `lookupSandboxOwner(ctx.db, row.sandboxId)` and its `githubRepos` doc; if found → `return { kind: "home" as const, installationId: row.installationId, name: homeRepo.name, githubId: homeRepo.githubId };`
     - else → `return { kind: "denied" as const, reason: "no path and no pinned home repository" };`
   - Pinned match (lines 180-182) → add `name: pinned.name`.
   - Entity home match (lines 196-198) → add `name: homeRepo.name, githubId: homeRepo.githubId`.
3. Update the doc comment (lines 122-140): "No path, or the sandbox's own home repository, keeps the historical behaviour: a full installation token. A linked repo of a multi-repo session gets a full token too, ..." becomes "No path, or the sandbox's own home repository, gets a token for the home repository only. A linked repo of a multi-repo session gets a token for that repository only, from its own installation, ...". Keep the rest of the comment.

Do not change the linked or sibling branches.

**Verify**: `pnpm --filter @eva/backend typecheck` → no new errors in `sandboxGitCredentials.ts`.

### Step 3: Mint scoped tokens in the HTTP route

In `packages/backend/convex/http.ts` `/api/git-credentials` handler, replace
the final `mintInstallationToken` call (lines 327-330) with:

```ts
    const credential = await ctx.runAction(internal.githubAuth.mintRepoToken, {
      installationId: resolved.installationId,
      githubId: resolved.kind === "home" ? resolved.githubId : undefined,
      name: resolved.name,
    });
```

Update the linked-repo comment (lines 319-320, "a full token") to "a token for that repository only, from that repo's own installation". Update the body comment (lines 272-278, "which still gets a primary token") to "which gets a token for the home repository only".

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 4: Scope the daemon's `GH_TOKEN` action

In `packages/backend/convex/_github/api.ts` `getInstallationTokenAction`
(lines 27-36), replace `getInstallationToken(repo.installationId)` with
`getRepoInstallationToken(repo.installationId, { githubId: repo.githubId, name: repo.name })`
and update the doc comment to "Returns a short-lived token for one repository
(the given repo) of its GitHub App installation." Keep the export name. Fix
the import on line 8 (`getInstallationToken` becomes unused here; remove it).

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0; `grep -n "getInstallationToken(" packages/backend/convex/_github/api.ts` → no matches.

### Step 5: Scope the env-file token and the clone token

In `packages/backend/convex/_sandbox_runtime/git.ts`:

1. Add a required parameter `repo: { githubId: number | undefined; name: string }` to `createSandbox` (line 382), directly after `installationId`. At line 427 use `getRepoInstallationToken(installationId, repo)`.
2. At both call sites in `createSandboxAndPrepareRepo` (lines 1862 and 1881) pass `{ githubId: undefined, name }` (that function has `owner` and `name` but no `githubId`; the name scope is correct within one installation).
3. In `cloneRepoInto` (line 1156) use `getRepoInstallationToken(installationId, { githubId: undefined, name })`.
4. Update the import on line 11.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0; `grep -n "getInstallationToken(" packages/backend/convex/_sandbox_runtime/git.ts` → no matches.

### Step 6: Tests, docs, changelog, commit

1. In `packages/backend/tests/sandboxSiblingReadAccess.test.ts`:
   - Update every home expectation to the new shape. Entity-bound sandbox (`fixture()`): `{ kind: "home", installationId: 1, name: "eva", githubId: 111 }`. Pinned orphan (`orphanFixture({ pinHome: true })`, and the backfill/first-install tests): `{ kind: "home", installationId: 9, name: "carepulse-ts" }`. The "pin does not bypass sibling checks" test: the pin matches first, so `{ kind: "home", installationId: 1, name: "eva" }`.
   - Rename the test "no path keeps today's full installation token" to "no path gets a token for the home repository only".
   - Add: pinned orphan, no `path` → `{ kind: "home", installationId: 9, name: "carepulse-ts" }`.
   - Add: unpinned orphan (`orphanFixture({ pinHome: false })`), no `path` → `{ kind: "denied", reason: "no path and no pinned home repository" }`.
   - Add: entity-bound sandbox, unparsable `path: "x"` (check first that `parseRepoPath("x")` returns null in `_sandbox_runtime/gitCredentialsPath.ts`) → home with `name: "eva"`, not installation-wide.
2. In `docs/multi-repo-sessions.md` line 78, change "A request with no path (old helper scripts baked into snapshots) falls back to the primary installation." to "A request with no path (old helper scripts baked into snapshots) gets a token for the home repository only. Every token the route mints names one repository."
3. Add to the top of `internal/changelog/2026-11.md`, directly under `# Changelog — November 2026`:
   ```
   ## Sandbox GitHub tokens cover one repository - <today, YYYY-MM-DD>

   - The git credential helper route, the `GH_TOKEN` refresh action, the sandbox env file and the clone now mint tokens with `repositoryIds`/`repositoryNames` for the sandbox's own (or linked) repository (`githubAuth.mintRepoToken`, `getRepoInstallationToken`).
   - A no-path helper request gets the home repository only; with no pin and no owning session it is denied.
   - WHY: sandboxes received installation-wide GitHub App tokens, so agent code could read or push to every repo in the installation.
   ```

**Verify**:
- `pnpm --filter @eva/backend test -- tests/sandboxSiblingReadAccess.test.ts tests/gitCredentialsPath.test.ts tests/gitCredentialHelperCache.test.ts` → all pass.
- `pnpm --filter @eva/backend typecheck` → exit 0; `pnpm lint` → exit 0.
- `grep -rn "mintInstallationToken" packages/backend/convex --include=*.ts | grep -v _generated` → no matches.

Commit: `fix(backend): scope sandbox GitHub tokens to one repository`.

### Step 7 (optional, needs operator approval): narrow permissions

Do this step **only if the operator confirms** (a) the GitHub App's
configured permissions and (b) that the set below is enough. Requested
permissions must be a subset of what the App has, or GitHub rejects the mint
with 422.

Proposed set for home and linked tokens, from what sandboxes do (see "Current state"):

```ts
{
  contents: "write",
  pull_requests: "write",
  workflows: "write",
  checks: "read",
  actions: "read",
  statuses: "read",
  metadata: "read",
}
```

If approved, add it as a `permissions` key in `repoInstallationAuth` only
(not in `siblingRepoInstallationAuth`, which stays contents-only). Commit
separately: `fix(backend): narrow sandbox GitHub token permissions`.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0. A manual check
by the operator in a real sandbox: `git push` of a side branch and
`gh pr create` both succeed.

## Test plan

- `tests/sandboxSiblingReadAccess.test.ts`: existing home expectations updated to carry `name` (and `githubId` when the entity's repo has one); 3 new cases (pinned no-path, unpinned orphan no-path denied, unparsable path).
- Existing that must pass: `tests/gitCredentialsPath.test.ts`, `tests/gitCredentialHelperCache.test.ts`.
- The minting itself (`appAuth()`) needs real GitHub credentials and is not unit tested; the decision function is. Do not mock `@octokit/auth-app`.
- Manual (operator, after deploy): in a session sandbox, `git push` to the home repo works; `gh pr create` on a side branch works; `gh api repos/<owner>/<another repo in the same installation>` with the sandbox `GH_TOKEN` returns 404.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] Targeted test command in Step 6 passes, including the 3 new cases
- [ ] `grep -rn "mintInstallationToken" packages/backend/convex --include=*.ts | grep -v _generated` → no matches
- [ ] `grep -n "getInstallationToken(" packages/backend/convex/_sandbox_runtime/git.ts packages/backend/convex/_github/api.ts` → no matches
- [ ] `pnpm lint` exits 0
- [ ] `docs/multi-repo-sessions.md` and `internal/changelog/2026-11.md` updated
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated, if that file exists

## STOP conditions

Stop and report back (do not improvise) if:

- `typecheck` reports that `internal.githubAuth.mintRepoToken` does not exist. Do NOT run `npx convex codegen`; report it. (Workaround the operator may approve: keep the export name `mintInstallationToken` but change its args and behaviour.)
- Any caller of `createSandbox` outside `createSandboxAndPrepareRepo` exists (`grep -rn "createSandbox(" packages/backend/convex --include=*.ts | grep -v _generated`), or a caller cannot name the repository.
- You find a sandbox flow that needs one token for more than one repository at once (for example a group snapshot builder or linked-repo step that uses `GITHUB_TOKEN` from the env file to clone or push several repos). Today `cloneRepoInto` is called once per repository (`git.ts:1196`, `linkedRepos.ts:154`, `_repoGroups/snapshotBuild.ts:77`); if that is no longer true, stop.
- `resolveCredentialRequest` has callers other than `convex/http.ts` and `tests/sandboxSiblingReadAccess.test.ts` that read the `home` shape.
- You are asked to do Step 7 without the operator's explicit confirmation of the App's permissions.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Behaviour change for multi-repo sessions: `GH_TOKEN` now covers the primary repository only. `git` in a linked repo still works (the credential helper sends the path and gets a linked-repo token). `gh` commands run inside a linked repo will get 404/403 from GitHub. Eva opens linked-repo PRs server-side, so this should not block normal flows; watch for reports.
- `getInstallationTokenAction` still accepts any repo the user can reach, and the sandbox VM token is a full user identity. Plan 002 removes that token from agent env; pinning the token to its repo (a `repoId` claim) is the durable fix.
- Rows written before `repoOwner`/`repoName` were pinned and whose sandbox has no owning session now get 403 on a no-path request instead of an installation token. Every current helper install pins the row, so these are old snapshot-prep sandboxes; acceptable.
- Reviewers: check that no remaining `appAuth()({ type: "installation", installationId })` call without a repository scope can reach a sandbox.
