# Plan 003: Scope every GitHub token a sandbox receives to the repository it works on

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` if that file exists — unless a reviewer dispatched you
> and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/githubAuth.ts packages/backend/convex/sandboxGitCredentials.ts packages/backend/convex/http.ts packages/backend/convex/_github/api.ts packages/backend/convex/_sandbox_runtime/git.ts packages/backend/convex/_sandbox_runtime/gitCredentials.ts packages/backend/convex/_sandbox_runtime/gitCredentialsPath.ts packages/backend/callback-src/providers/githubToken.ts docs/multi-repo-sessions.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (a wrong scope breaks clone, push or `gh pr create` in sandboxes)
- **Depends on**: none (plan 002 is related: it limits who can call `getInstallationTokenAction`)
- **Category**: security
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

A GitHub App installation often covers many repositories (a whole org). Today a
sandbox gets installation-wide GitHub tokens from four places. Agent code in the
sandbox can read them (`GITHUB_TOKEN`/`GH_TOKEN` are in its environment) and use
them to read or push to **every** repository in the installation, not only the
one the user connected to Eva. The code already scopes tokens for "sibling"
repositories to one repository; the home repository, the legacy no-path helper
request, and the env tokens do not. After this plan, every token handed into a
sandbox names exactly one repository (`repositoryIds` or `repositoryNames`), so
the blast radius of a leaked sandbox token is one repo. Permission narrowing
(contents/pull requests only) is a second, optional step gated on operator
confirmation, because the needed set is not fully provable from code.

## Current state

### Where installation-wide tokens enter a sandbox

1. `/api/git-credentials` home and linked requests — `convex/http.ts:284-329` calls `internal.githubAuth.mintInstallationToken` (no repository scope).
2. The legacy no-path request — `convex/sandboxGitCredentials.ts:188-194` returns `kind: "home"` for the whole installation.
3. The daemon's `GH_TOKEN` refresh — `callback-src/providers/githubToken.ts:40-50` calls the public action `github:getInstallationTokenAction` with the sandbox `CONVEX_TOKEN`; `convex/_github/api.ts:28-40` returns `getInstallationToken(repo.installationId)` (installation-wide). The callback writes it to `process.env.GITHUB_TOKEN`/`GH_TOKEN` (`githubToken.ts:62-68`, `94`), and agents inherit it. Called on every daemon turn: `claudeSdkDaemon.ts:423`, `codexAppServerDaemon.ts:298`, `cursorSdkDaemon.ts:258`, and at one-shot start `index.ts:157`.
4. The sandbox env file at create — `convex/_sandbox_runtime/git.ts:393` `getInstallationToken(installationId)`, written as `GITHUB_TOKEN: token` at `git.ts:455`.
5. Clone — `convex/_sandbox_runtime/git.ts:1122` `getInstallationToken(installationId)` passed to `sandbox.git.clone` (`docs/multi-repo-sessions.md:141` says clone tokens are stripped from `origin` before snapshot capture).

`convex/snapshotActions.ts:240` also calls `getInstallationToken`, but uses it
server-side only (GitHub contents API). Out of scope.

### Token helpers, `packages/backend/convex/githubAuth.ts`

Lines 59-68 (installation-wide, cached by `createAppAuth`):

```ts
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

Lines 70-89 (the scoped pattern to reuse):

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

Lines 126-138:

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

`mintInstallationToken` has one caller: `convex/http.ts:325`. The
`createAppAuth` cache (comment at `githubAuth.ts:50-54`) keys by installation,
permissions **and repositories**, so scoped tokens cache correctly.
`@octokit/auth-app` accepts `repositoryIds?: number[]` or
`repositoryNames?: string[]` (one or the other). Repository names are unique
within one installation (an installation belongs to one account).

### Credential decision, `packages/backend/convex/sandboxGitCredentials.ts:159-200`

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
    // linked (lines 225-236) and sibling (238-260) follow
```

`pinnedHomeRepo(row)` (lines 74-79) returns `{ owner, name }` from
`row.repoOwner`/`row.repoName`, or null on rows written before the pin.
`lookupSandboxOwner` (lines 82-122) finds the session/project/task that owns the
sandbox. `githubRepos` rows have `githubId: v.optional(v.number())`
(`_validators/tableFields.ts:1018`).

### HTTP route, `packages/backend/convex/http.ts:284-329` (end of handler)

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

### Public token action, `packages/backend/convex/_github/api.ts:27-40`

```ts
/** Returns a short-lived installation token for a given GitHub repo's app installation. */
export const getInstallationTokenAction = action({
  args: { repoId: v.id("githubRepos") },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const repo = await getActionRepoWithAccess(ctx, args.repoId);
    const token = await getInstallationToken(repo.installationId);
    return { token };
  },
});
```

No web caller (`grep -rn getInstallationTokenAction apps` is empty). The only
caller is the sandbox callback. `tests/codeStructureServicesContract.test.ts:15,31`
pins that the callback calls this path by name; keep the name.

### `createSandbox` and clone, `packages/backend/convex/_sandbox_runtime/git.ts`

`createSandbox(client, installationId, sandboxEnvVars, lifecycle, snapshotName?, readyTimeoutSeconds?, onSandboxAcquired?, forkFrom?, driveCacheRole?)` (line 348) has no repository argument. Its only callers are inside `createSandboxAndPrepareRepo(... installationId, owner, name, ...)` at lines ~1851 and ~1870, which know `owner`/`name`.
`cloneRepoInto(sandbox, installationId, owner, name, destDir, onProgress?)` (line 1113) knows `owner`/`name`.

### What sandboxes do with GitHub (for the permission question)

- `git clone`, `git fetch`, `git push` (contents).
- Session prompt tells the agent to run `gh pr create` for side branches: `convex/_sessions/prompts.ts:60` and `:282` (pull requests write).
- MCP tool text tells the agent to run `gh pr checks`: `convex/mcp/chatSelfTools.ts:759` (checks/actions/statuses read).
- Task, automation, evaluation and test-gen prompts say "Do NOT run git push or gh pr commands" (`_taskWorkflow/prompts.ts:91`).
- An agent can edit `.github/workflows/*`; GitHub rejects such a push unless the token has `workflows: write`.
- Eva itself (server side) publishes linked-repo PRs (`docs/multi-repo-sessions.md:113`), not the sandbox.

### Multi-repo sessions (from `docs/multi-repo-sessions.md:72-81`)

> - The in-sandbox helper sets `git config --global credential.useHttpPath true`, reads `path=` from git's stdin, sanitises it, and POSTs `{ "path": "<owner>/<name>.git" }` to `/api/git-credentials`.
> - The route (`http.ts`) parses the path, looks the repo's `installationId` up by owner/name, and mints only when that id is in the sandbox's allow-list — otherwise **403**. A request with no path (old helper scripts baked into snapshots) falls back to the primary installation.
> - The helper's token cache file is keyed by a hash of the repository path (`/tmp/git-cred-cache-<hash>`), so a cache hit for one repo can never serve another repo's token.

So git (push/fetch) in a linked repo goes through the helper with a path and
gets a "linked" token; scoping that token to the linked repo keeps it working.
`GH_TOKEN` (env) is single-valued; after this plan it covers the primary repo
only. Today it covers the primary's installation, which only helps a linked repo
when both share an installation.

### Conventions (quoted from `/tmp/repo/CLAUDE.md`, `docs/eva-convex.md`)

- "No `any`, `unknown`, `as`, or non-null `!`. No `isRecord(object: unknown)` — parse at the boundary (Zod)."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary."
- "Eliminate duplication, centralise your changes so its easier to update them"
- "After medium+ changes: no banned types; `tsc` where relevant; `/changelog` (or `internal/changelog.md`)."
- `docs/eva-convex.md`: "Never manually define interfaces for Convex documents. Always import: `Doc<"tableName">`, `Id<"fieldName">`"; "Avoid importing `process.env` helpers into Convex isolate workflow files. If something needs env vars, keep it in `"use node"` actions." (`githubAuth.ts` and `_github/api.ts` are `"use node"`; `sandboxGitCredentials.ts` and `http.ts` are not — do not import `githubAuth.ts` into them; call it via `ctx.runAction(internal.githubAuth.*)` as today.)
- Changelog: top of `internal/changelog.md`, `## <Title>`, `Date: YYYY-MM-DD`, `WHY: ...`.

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Convex typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Callback typecheck | `pnpm --filter @eva/backend typecheck:callback` | exit 0 |
| Targeted tests | `pnpm --filter @eva/backend test -- <path relative to packages/backend>` | all pass |
| Lint | `pnpm lint` | exit 0 |
| Schema check | `node scripts/check-schema-narrowing.mjs` | exit 0 |

Run only the targeted test files listed below. As of planning, 5 backend tests
fail already (`callback-src/tests/pendingQuestion.test.ts`,
`tests/sessionStopRecoveryContract.test.ts` x3,
`tests/providerAccountHandoffContract.test.ts`); they are plan 001's, not yours.
NEVER run `npx convex codegen`, `convex dev` or `convex deploy`. New exports
in an existing Convex module need no codegen (`_generated/api.d.ts` uses
`typeof import(...)` per module). A brand-new Convex module file would; this
plan adds none.

## Suggested executor toolkit

- `security-audit` skill, if available, for a second look at the final diff.
- Read `packages/backend/tests/artifactState.test.ts` for the convex-test pattern.

## Scope

**In scope**:

- `packages/backend/convex/githubAuth.ts`
- `packages/backend/convex/sandboxGitCredentials.ts`
- `packages/backend/convex/http.ts` (only the `/api/git-credentials` handler)
- `packages/backend/convex/_github/api.ts` (only `getInstallationTokenAction`)
- `packages/backend/convex/_sandbox_runtime/git.ts` (only `createSandbox`, its two call sites, and `cloneRepoInto`)
- `packages/backend/tests/sandboxGitCredentials.test.ts` (create)
- `docs/multi-repo-sessions.md` (the "Git auth across installations" bullets)
- `internal/changelog.md`

**Out of scope** (do NOT touch):

- `convex/snapshotActions.ts` — server-side token, never enters a sandbox.
- `convex/_sandbox_runtime/gitCredentials.ts` helper script — the client side is fine; changing it means re-baking snapshots.
- `callback-src/**` — the callback just stores whatever token the action returns; no change, no bundle rebuild.
- The `sibling` branch logic and its permissions.
- Any change to the `sandboxGitCredentials` table schema.

## Git workflow

- Work on the current branch the operator gives you. Do not create a branch, push or open a PR unless told.
- Conventional commits, for example `fix(backend): scope sandbox GitHub tokens to one repository`. Commit after Step 6 (repository scoping). Step 7 (permissions) is a separate commit only if the operator approves it.

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
3. Replace `mintInstallationToken` with `mintRepoToken` (same args as `mintSiblingRepoToken`: `installationId: v.number(), githubId: v.optional(v.number()), name: v.string()`; same `returns`), whose handler returns `toSandboxGitCredential(await repoInstallationAuth(args.installationId, { githubId: args.githubId, name: args.name }))`.

Leave `getInstallationToken` in place; server-side callers (`snapshotActions.ts`, `getInstallationOctokit`) still use it.

**Verify**: `pnpm --filter @eva/backend typecheck` → errors only at `convex/http.ts` (`mintInstallationToken` no longer exists). Any other error → fix in this file. If the error says `internal.githubAuth.mintRepoToken` does not exist in the generated API types, see STOP conditions.

### Step 2: Make every "home" decision name the home repository

In `packages/backend/convex/sandboxGitCredentials.ts`:

1. Change the `home` member of the `returns` union to:
   ```ts
   v.object({
     kind: v.literal("home"),
     installationId: v.number(),
     name: v.string(),
     githubId: v.optional(v.number()),
   }),
   ```
2. Rewrite the start of the handler so a missing or unparsable path is **the home repository only**, never the whole installation:
   - `const requested = args.path === undefined ? null : parseRepoPath(args.path);`
   - `const pinned = pinnedHomeRepo(row);`
   - If `!requested`:
     - if `pinned` → `return { kind: "home", installationId: row.installationId, name: pinned.name };`
     - else load `lookupSandboxOwner(ctx.db, row.sandboxId)` and its `githubRepos` doc; if found → `return { kind: "home", installationId: row.installationId, name: homeRepo.name, githubId: homeRepo.githubId };`
     - else → `return { kind: "denied", reason: "no path and no pinned home repository" };`
   - Pinned match (current line 198-200) → add `name: pinned.name`.
   - Entity home match (current line 214-216) → add `name: homeRepo.name, githubId: homeRepo.githubId`.
3. Update the doc comment on `resolveCredentialRequest` (lines 140-158): "No path ... keeps the historical behaviour: a full installation token" becomes "No path, or the sandbox's own home repository, gets a token for the home repository only".

Do not change the linked or sibling branches.

**Verify**: `pnpm --filter @eva/backend typecheck` → no new errors in `sandboxGitCredentials.ts`.

### Step 3: Mint scoped tokens in the HTTP route

In `packages/backend/convex/http.ts` `/api/git-credentials` handler, replace the
final `mintInstallationToken` call with:

```ts
    const credential = await ctx.runAction(internal.githubAuth.mintRepoToken, {
      installationId: resolved.installationId,
      githubId: resolved.kind === "home" ? resolved.githubId : undefined,
      name: resolved.name,
    });
```

Update the linked-repo comment ("a full token") to "a token for that repository only, from that repo's own installation". Update the body comment at lines ~270-275 ("absent for an old baked helper script, which still gets a primary token") to "... which gets a token for the home repository only".

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 4: Scope the daemon's `GH_TOKEN` action

In `packages/backend/convex/_github/api.ts` `getInstallationTokenAction`, replace
`getInstallationToken(repo.installationId)` with
`getRepoInstallationToken(repo.installationId, { githubId: repo.githubId, name: repo.name })`
and update the doc comment to "Returns a short-lived token for one repository
(the given repo) of its GitHub App installation." Keep the export name. Fix the
import line (`getInstallationToken` may become unused here; remove it if so).

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0; `pnpm --filter @eva/backend test -- tests/codeStructureServicesContract.test.ts` → pass.

### Step 5: Scope the env-file token and the clone token

In `packages/backend/convex/_sandbox_runtime/git.ts`:

1. Add a required parameter `repo: { githubId: number | undefined; name: string }` to `createSandbox`, directly after `installationId` (it is only called from `createSandboxAndPrepareRepo`). At line ~393 use `getRepoInstallationToken(installationId, repo)`.
2. At both call sites in `createSandboxAndPrepareRepo` (~1851, ~1870) pass `{ githubId: undefined, name }` (that function has `owner` and `name` but no `githubId`; the name scope is correct within one installation).
3. In `cloneRepoInto` (line ~1122) use `getRepoInstallationToken(installationId, { githubId: undefined, name })`.
4. Update the import from `../githubAuth`.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0; `grep -n "getInstallationToken(" packages/backend/convex/_sandbox_runtime/git.ts` → no matches.

### Step 6: Tests, docs, changelog, commit

1. Create `packages/backend/tests/sandboxGitCredentials.test.ts` with convex-test (pattern: `tests/artifactState.test.ts`; `const modules = import.meta.glob("../convex/**/*.ts")`). Insert `sandboxGitCredentials` rows directly with `t.run` (fields: `sandboxId`, `installationId`, `secret`, `repoOwner`, `repoName`, `createdAt`; use fake values like `"test-secret-1"`). Call `t.query(internal.sandboxGitCredentials.resolveCredentialRequest, { secret, path })`. Cases:
   - Pinned row, no `path` → `{ kind: "home", installationId, name: "<repoName>" }`.
   - Pinned row, `path: "<owner>/<repoName>.git"` → `kind: "home"` with `name`.
   - Pinned row, unparsable `path: "x"` → `kind: "home"` with the pinned `name` (not installation-wide).
   - Row without `repoOwner`/`repoName` and no owning entity, no `path` → `kind: "denied"`.
   - Unknown secret → `kind: "denied"`.
2. In `docs/multi-repo-sessions.md` "Git auth across installations", change "A request with no path (old helper scripts baked into snapshots) falls back to the primary installation." to "A request with no path (old helper scripts baked into snapshots) gets a token for the home repository only. Every token the route mints names one repository."
3. Add to the top of `internal/changelog.md`:
   ```
   ## Sandbox GitHub tokens cover one repository

   Date: <today, YYYY-MM-DD>

   WHY: Sandboxes received installation-wide GitHub App tokens (git credential helper, GH_TOKEN refresh, env file, clone), so agent code could read or push to every repo in the installation. All of them now use repositoryIds/repositoryNames for the sandbox's own (or linked) repository. A no-path helper request gets the home repository only.
   ```

**Verify**:
- `pnpm --filter @eva/backend test -- tests/sandboxGitCredentials.test.ts tests/gitCredentialsPath.test.ts tests/gitCredentialHelperCache.test.ts tests/codeStructureServicesContract.test.ts` → all pass.
- `pnpm --filter @eva/backend typecheck` → exit 0; `pnpm lint` → exit 0; `node scripts/check-schema-narrowing.mjs` → exit 0.
- `grep -rn "mintInstallationToken" packages/backend/convex --include=*.ts | grep -v _generated` → no matches.

Commit: `fix(backend): scope sandbox GitHub tokens to one repository`.

### Step 7 (optional, needs operator approval): narrow permissions

Do this step **only if the operator confirms** (a) the GitHub App's configured
permissions and (b) that the set below is enough. Requested permissions must be
a subset of what the App has, or GitHub rejects the mint with 422.

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

If approved, add it as a `permissions` key in `repoInstallationAuth` only (not
in `siblingRepoInstallationAuth`, which stays contents-only). Commit separately:
`fix(backend): narrow sandbox GitHub token permissions`.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0. A manual check by the
operator in a real sandbox: `git push` of a side branch and `gh pr create` both
succeed.

## Test plan

- New: `tests/sandboxGitCredentials.test.ts` — five cases listed in Step 6.
- Existing that must pass: `tests/gitCredentialsPath.test.ts`, `tests/gitCredentialHelperCache.test.ts`, `tests/codeStructureServicesContract.test.ts`.
- The minting itself (`appAuth()`) needs real GitHub credentials and is not unit tested; the decision function is. Do not mock `@octokit/auth-app`.
- Manual (operator, after deploy): in a session sandbox, `git push` to the home repo works; `gh pr create` on a side branch works; `GH_TOKEN=$GH_TOKEN gh api repos/<owner>/<another repo in the same installation>` returns 404.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] Targeted test command in Step 6 passes, including the new file
- [ ] `grep -rn "mintInstallationToken" packages/backend/convex --include=*.ts | grep -v _generated` → no matches
- [ ] `grep -n "getInstallationToken(" packages/backend/convex/_sandbox_runtime/git.ts packages/backend/convex/_github/api.ts` → no matches
- [ ] `pnpm lint` exits 0
- [ ] `docs/multi-repo-sessions.md` and `internal/changelog.md` updated
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated, if that file exists

## STOP conditions

Stop and report back (do not improvise) if:

- `typecheck` reports that `internal.githubAuth.mintRepoToken` does not exist. This should not happen: `convex/_generated/api.d.ts:422,984` types the module as `typeof import("../githubAuth.js")`, so new exports in an existing module appear without codegen. If it does happen, do NOT run `npx convex codegen`; report it. (Workaround the operator may approve: keep the export name `mintInstallationToken` but change its args and behaviour.)
- Any caller of `createSandbox` outside `createSandboxAndPrepareRepo` exists (`grep -rn "createSandbox(" packages/backend/convex`), or a caller cannot name the repository.
- You find a sandbox flow that needs one token for more than one repository at once (for example a group snapshot builder that uses `GITHUB_TOKEN` from the env file to clone several repos). Today linked clones use `cloneRepoInto` with their own token; if that is no longer true, stop.
- You are asked to do Step 7 without the operator's explicit confirmation of the App's permissions.
- `resolveCredentialRequest` has callers other than `convex/http.ts` that read the `home` shape.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Behaviour change for multi-repo sessions: `GH_TOKEN` now covers the primary repository only. `git` in a linked repo still works (credential helper sends the path and gets a linked-repo token). `gh` commands run inside a linked repo will get 404/403 from GitHub. Eva publishes linked-repo PRs server-side, so this should not block normal flows; watch for reports.
- `getInstallationTokenAction` still accepts any repo the user can reach, and the sandbox token is a full user identity. Pinning the sandbox token to its repo (a `repoId` claim, see plan 002 maintenance notes) closes that.
- Rows written before `repoOwner`/`repoName` were pinned and whose sandbox has no owning entity now get 403 on a no-path request instead of an installation token. These are old snapshot-prep sandboxes; acceptable.
- Reviewers: check that no remaining `appAuth()({ type: "installation", installationId })` call without a repository scope can reach a sandbox.
