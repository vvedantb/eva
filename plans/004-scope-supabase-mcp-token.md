# Plan 004: Resolve the Supabase MCP token from one repository the caller may use

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` if that file exists — unless a reviewer dispatched you
> and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/mcp/nodeActions.ts packages/backend/convex/mcp/supabase.ts packages/backend/convex/mcp/entityRef.ts packages/backend/convex/mcp/queries.ts packages/backend/convex/mcp/routes.ts packages/backend/convex/mcp/toolShared.ts docs/mcp-security.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S (Steps 1-3, sandbox fix) + S (Step 4, unscoped clients)
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

The Eva MCP server exposes read-only Supabase tools (`supabase_execute_sql`,
`supabase_list_tables`, ...). To call Supabase it needs a
`SUPABASE_ACCESS_TOKEN`, which users store as a repo env var. The resolver
ignores which repo the caller works in: it walks **all** of the user's repos
and uses the first token it finds, cached per user. A sandbox MCP token is
meant to be pinned to one repo (`scopedRepoId`), as `docs/mcp-security.md`
promises, but here a sandbox in repo A can query the Supabase projects of repo
B's token. The result also depends on repo order, so the tools can silently
point at the wrong database. After this plan, a sandbox uses only its own
repo's token, and a client without a pinned repo must name the repo, which is
checked for access.

## Current state

Files:

- `packages/backend/convex/mcp/nodeActions.ts` — `resolveSupabaseToken` (lines 2107-2152) and `handleMcpRequest` (2158-2215), which passes credentials to `supabaseTools`.
- `packages/backend/convex/mcp/supabase.ts` — builds the proxied Supabase tools (lines 171-296).
- `packages/backend/convex/mcp/entityRef.ts` — `entityAccess(ctx, credentials)` with `assertRepoAccess` and `resolveRepoRef` (lines 206-326).
- `packages/backend/convex/mcp/queries.ts` — `checkRepoAccessForUser` (lines 25-33), `listUserRepos` (47-70).
- `packages/backend/convex/mcp/routes.ts` — `getDecryptedRepoEnvVars` (lines 14-28): merged team + repo vars for one repo, no access check (internal).
- `packages/backend/convex/mcp/toolShared.ts` — `McpCredentials` interface (lines 21-35).
- `docs/mcp-security.md:31`.

`packages/backend/convex/mcp/nodeActions.ts:2107-2152`:

```ts
const supabaseTokenCache = new Map<
  string,
  { token: string; expiresAt: number }
>();

export const resolveSupabaseToken = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { clerkUserId }): Promise<string | null> => {
    const cached = supabaseTokenCache.get(clerkUserId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const user = await ctx.runQuery(internal.auth.getUserByClerkId, {
      clerkId: clerkUserId,
    });
    if (!user) return null;
    const repos = await ctx.runQuery(internal.mcp.queries.listUserRepos, {
      userId: user._id,
    });

    // Search for Supabase token in each repo's env vars
    for (const { id: repoId } of repos) {
      try {
        const vars: EnvVar[] = await ctx.runAction(
          internal.mcp.routes.getDecryptedRepoEnvVars,
          { repoId },
        );
        const match: EnvVar | undefined = vars.find(
          (entry) => entry.key === "SUPABASE_ACCESS_TOKEN",
        );
        if (match) {
          supabaseTokenCache.set(clerkUserId, {
            token: match.value,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });
          return match.value;
        }
      } catch {
        // Skip failed repos
      }
    }

    return null;
  },
});
```

`CACHE_TTL_MS` is `5 * 60 * 1000` (`nodeActions.ts:144`).

`packages/backend/convex/mcp/supabase.ts:171-196` and `231-241`:

```ts
interface McpCredentials {
  clerkUserId: string;
  scopedRepoId?: string;
}

export async function supabaseTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): Promise<EvaTool[]> {
  const { clerkUserId } = credentials;

  // Try to resolve Supabase token
  let token: string | null;
  try {
    token = await ctx.runAction(internal.mcp.nodeActions.resolveSupabaseToken, {
      clerkUserId,
    });
  } ...
        handler: async (args: Record<string, unknown>) => {
          // Re-resolve token in case it expired
          const currentToken = await ctx.runAction(
            internal.mcp.nodeActions.resolveSupabaseToken,
            { clerkUserId },
          );
```

`scopedRepoId` is declared but never read. Tool discovery (`discoverTools(token)`,
line 148) needs a token **before** any tool runs, because the tool list and
input schemas come from the remote Supabase MCP server. `toolDefinitionCache` is
keyed by token.

Where `scopedRepoId` comes from: `nodeActions.ts:91` sets it from the sandbox
`mcp-internal` token's `repoId` claim. Clerk-authenticated MCP clients (and
Manager Ave) have no `scopedRepoId` (`entityRef.ts:224-226`: "Manager Ave
carries no `scopedRepoId`, so it reaches every repo the user can reach").

The access helper to reuse, `packages/backend/convex/mcp/entityRef.ts:224-236`:

```ts
  /**
   * Credential-grade check: the user check plus the token pin. Manager Ave
   * carries no `scopedRepoId`, so it reaches every repo the user can reach.
   */
  async function assertRepoAccess(
    repoId: string,
    userId: string,
  ): Promise<void> {
    if (scopedRepoId && scopedRepoId !== repoId) {
      throw new Error(
        "Access denied: this token is scoped to a different repository.",
      );
    }
    await assertUserRepoAccess(repoId, userId);
  }
```

and `resolveRepoRef(ref: RepoRef, userId)` (lines 239-254), where
`RepoRef = { repoId?: string; repoName?: string; app?: string }`
(`entityRef.ts:85-89`). It returns `{ repoId }` or a `toolErrorResult`. The
comment at `entityRef.ts:202-204` states the rule this plan applies: "Repo
credentials (Convex deploy keys, Postgres, system skills) keep the sandbox
token's single-repo pin". The existing exemplar for "explicit repo outside a
sandbox" is `get_skill` in `convex/mcp/tools.ts:1626-1637`:

```ts
        let repoId = scopedRepoId;
        if (!repoId) {
          if (!repoName) {
            return toolErrorResult(
              'get_skill needs a "repoName" when called outside an Eva sandbox.',
            );
          }
          const resolved = await resolveRepoByName(repoName, app, userId);
          if ("content" in resolved) return resolved;
          repoId = resolved.repo.id;
        }
        await assertRepoAccess(repoId, userId);
```

`docs/mcp-security.md:31`: "Every MCP tool resolves the Clerk user ID to a
Convex user, then checks that the user can access the repo before it returns
data. A sandbox token narrows access further to its `scopedRepoId`."

`decryptValue` returns values without the `enc:` prefix unchanged, so tests can
store plaintext fake tokens with no `ENCRYPTION_KEY` (`convex/encryption.ts:44-48`).

### Conventions (quoted from `/tmp/repo/CLAUDE.md`, `docs/eva-convex.md`)

- "No `any`, `unknown`, `as`, or non-null `!`. No `isRecord(object: unknown)` — parse at the boundary (Zod). Hard types → rethink design." (`supabase.ts` already uses `unknown` in existing code; do not add new uses. Parse tool args with Zod.)
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary."
- "Eliminate duplication, centralise your changes so its easier to update them"
- "After medium+ changes: no banned types; `tsc` where relevant; `/changelog` (or `internal/changelog.md`)."
- `docs/eva-convex.md`: "Always import: `Doc<"tableName">`, `Id<"fieldName">` ... Never duplicate schema types manually."
- Changelog: top of `internal/changelog.md`, `## <Title>`, `Date: YYYY-MM-DD`, `WHY: ...`.

## Commands you will need

Run from `/tmp/repo`.

| Purpose | Command | Expected on success |
|---|---|---|
| Convex typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Targeted tests | `pnpm --filter @eva/backend test -- <path relative to packages/backend>` | all pass |
| Lint | `pnpm lint` | exit 0 |

Run only the targeted test files listed below. As of planning, 5 backend tests
fail already (`callback-src/tests/pendingQuestion.test.ts`,
`tests/sessionStopRecoveryContract.test.ts` x3,
`tests/providerAccountHandoffContract.test.ts`); they are plan 001's, not yours.
NEVER run `npx convex codegen`, `convex dev` or `convex deploy`.

## Scope

**In scope**:

- `packages/backend/convex/mcp/nodeActions.ts` (only `supabaseTokenCache`, `resolveSupabaseToken`, and a new `findSupabaseRepoId` beside it)
- `packages/backend/convex/mcp/supabase.ts`
- `packages/backend/tests/mcpSupabaseToken.test.ts` (create)
- `docs/mcp-security.md`
- `internal/changelog.md`

**Out of scope** (do NOT touch):

- `convex/mcp/routes.ts` `getDecryptedRepoEnvVars` — internal, used elsewhere; the access check belongs in the caller.
- `convex/mcp/entityRef.ts` — reuse `entityAccess`, do not change it.
- The `READ_ONLY_SUPABASE_TOOLS` allow-list and `SUPABASE_REMOTE_URL` (`read_only=true`).
- Any other MCP tool.

## Git workflow

- Work on the current branch the operator gives you. Do not create a branch, push or open a PR unless told.
- One commit per phase. Style (see `git log --oneline -10`), for example `fix(backend): ...`:
  - `fix(mcp): resolve Supabase token from the scoped repo only`
  - `fix(mcp): Supabase tools need a repo outside a sandbox`

## Steps

### Step 1: Make `resolveSupabaseToken` read one repo, after an access check

In `packages/backend/convex/mcp/nodeActions.ts`, replace `resolveSupabaseToken` with:

- `args: { clerkUserId: v.string(), repoId: v.string() }` (required).
- Cache key: `` `${clerkUserId}:${repoId}` ``.
- Handler order:
  1. cache hit → return token;
  2. `user = runQuery(internal.auth.getUserByClerkId, { clerkId: clerkUserId })`; none → `null`;
  3. `hasAccess = runQuery(internal.mcp.queries.checkRepoAccessForUser, { repoId, userId: user._id })`; false → `null`;
  4. `vars = runAction(internal.mcp.routes.getDecryptedRepoEnvVars, { repoId })`; find `SUPABASE_ACCESS_TOKEN`; cache and return its value, else `null`.
- No `try/catch` that swallows errors for the single repo; let an error propagate (the caller already catches).

Add, directly below it, the discovery helper for clients without a pinned repo
(the old loop, but it returns the **repo id**, not the token):

```ts
/**
 * First repo (in listUserRepos order) whose env vars hold a Supabase token.
 * Used only to discover the Supabase tool list for a client with no pinned
 * repo; each tool call still names its repo and is access-checked.
 */
export const findSupabaseRepoId = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { clerkUserId }): Promise<string | null> => { ... },
});
```

Inside: user lookup, `listUserRepos`, then for each repo call
`getDecryptedRepoEnvVars` and return `repoId` on the first match (keep the
per-repo `try/catch` here, as today).

**Verify**: `pnpm --filter @eva/backend typecheck` → errors only in `convex/mcp/supabase.ts` (missing `repoId`).

### Step 2: Use the pinned repo in `supabaseTools`

In `packages/backend/convex/mcp/supabase.ts`:

1. Delete the local `interface McpCredentials` (lines 171-174) and import `McpCredentials` from `./toolShared`.
2. At the top of `supabaseTools`, decide the discovery repo:
   ```ts
   const { clerkUserId, scopedRepoId } = credentials;
   const discoveryRepoId =
     scopedRepoId ??
     (await ctx.runAction(internal.mcp.nodeActions.findSupabaseRepoId, {
       clerkUserId,
     }));
   if (!discoveryRepoId) { console.log("Supabase: no SUPABASE_ACCESS_TOKEN found, skipping"); return []; }
   ```
   Wrap in the existing `try/catch` pattern (lines 183-191) so a failure returns `[]`.
3. Resolve the discovery token with `resolveSupabaseToken({ clerkUserId, repoId: discoveryRepoId })`.
4. For now (this step only), in each tool handler resolve with `{ clerkUserId, repoId: discoveryRepoId }`. Step 4 replaces this for unscoped clients.

**Verify**:
- `pnpm --filter @eva/backend typecheck` → exit 0.
- `grep -n "resolveSupabaseToken" packages/backend/convex/mcp/supabase.ts` → every call passes `repoId`.

### Step 3: Tests for the resolver; commit

Create `packages/backend/tests/mcpSupabaseToken.test.ts` with convex-test.
Pattern: `packages/backend/tests/mcpEntityTools.test.ts:1-60` (fixture with an
owner and a stranger, `const modules = import.meta.glob("../convex/**/*.ts")`,
`TIMEOUT_MS = 30_000`). Fixture (`t.run`): users `OWNER` (`clerkId: "clerk|supabase-owner"`) and
`STRANGER`; repos A and B connected by `OWNER`, repo C connected by `STRANGER`
(`githubRepos` needs `owner`, `name`, `installationId`, `connectedBy`);
`repoEnvVars` rows: A has `[{ key: "OTHER", value: "x" }]`, B has
`[{ key: "SUPABASE_ACCESS_TOKEN", value: "sb-test-token-b" }]`, C has
`[{ key: "SUPABASE_ACCESS_TOKEN", value: "sb-test-token-c" }]` (each with `updatedAt: Date.now()`).

Cases via `t.action(internal.mcp.nodeActions.resolveSupabaseToken, ...)`:
- Owner + repo B → `"sb-test-token-b"`.
- Owner + repo A → `null` (no token in A; must **not** fall through to B).
- Owner + repo C → `null` (no access, even though C has a token).
- Unknown clerk id + repo B → `null`.
- `findSupabaseRepoId` for owner → repo B's id; for a user with no tokens → `null`.

The module-level cache persists between tests in one worker; use a fresh clerk
id per `describe` if a case could hit another case's cache entry.

**Verify**: `pnpm --filter @eva/backend test -- tests/mcpSupabaseToken.test.ts` → all pass (5 or more tests).

Commit: `fix(mcp): resolve Supabase token from the scoped repo only`.

### Step 4: Unscoped clients must name the repo on every Supabase tool call

In `packages/backend/convex/mcp/supabase.ts`, only when `scopedRepoId` is
undefined:

1. Before the loop, if any discovered tool's `inputSchema.properties` already has a `repoName` or `app` key, STOP (name collision; see STOP conditions).
2. Extend each tool's input shape with:
   ```ts
   repoName: z.string().describe("Eva repo whose SUPABASE_ACCESS_TOKEN to use (from list_repos). Not needed inside an Eva sandbox."),
   app: z.string().optional().describe('App name within a monorepo (e.g. "web"). Used with repoName.'),
   ```
   Spread these into `zodShape` only for unscoped credentials.
3. In the handler, for unscoped credentials:
   - Parse the repo args with Zod at the boundary: `const repoArgs = z.object({ repoName: z.string(), app: z.string().optional() }).safeParse(args)`; on failure return `toolErrorResult('Supabase tools need a "repoName" when called outside an Eva sandbox.')`.
   - Look up the Convex user (`internal.auth.getUserByClerkId`), then `const access = entityAccess(ctx, credentials)`; `const resolved = await access.resolveRepoRef({ repoName, app }, userId)`; return it if it is a tool error; then `await access.assertRepoAccess(resolved.repoId, userId)`.
   - Resolve the token with `{ clerkUserId, repoId: resolved.repoId }`.
   - Forward to Supabase **without** `repoName` and `app` (build a new object from `args` minus those two keys).
4. For scoped credentials keep Step 2's behaviour: `repoId: scopedRepoId`, no extra args.

Add test cases to `tests/mcpSupabaseToken.test.ts` only for the pure parts you
can reach without the network (for example, export a small pure function
`withoutRepoArgs(args)` and test it strips exactly `repoName` and `app`). Do not
call the real Supabase server in tests.

Update `docs/mcp-security.md:31` to: "Every MCP tool resolves the Clerk user ID
to a Convex user, then checks that the user can access the repo before it
returns data. A sandbox token narrows access further to its `scopedRepoId`.
Supabase tools use the `SUPABASE_ACCESS_TOKEN` of that one repo; outside a
sandbox, each Supabase call names its repo (`repoName`), which is
access-checked."

Add to the top of `internal/changelog.md`:

```
## Supabase MCP tools use one repo's token

Date: <today, YYYY-MM-DD>

WHY: resolveSupabaseToken took the first SUPABASE_ACCESS_TOKEN across all of a user's repos and cached it per user, so a sandbox pinned to one repo could query another repo's Supabase projects. It now reads only the sandbox's scopedRepoId (cache keyed by user and repo, access-checked); clients without a pinned repo pass repoName on each call.
```

**Verify**:
- `pnpm --filter @eva/backend typecheck` → exit 0
- `pnpm --filter @eva/backend test -- tests/mcpSupabaseToken.test.ts tests/mcpEntityTools.test.ts tests/mcpCodeModeTools.test.ts` → all pass
- `pnpm lint` → exit 0

Commit: `fix(mcp): Supabase tools need a repo outside a sandbox`.

## Test plan

- New file `packages/backend/tests/mcpSupabaseToken.test.ts`:
  - scoped repo with token → that token;
  - scoped repo without token → `null`, no fall-through to another repo (the regression this plan fixes);
  - repo the user cannot access → `null`;
  - unknown user → `null`;
  - `findSupabaseRepoId` happy path and none;
  - `withoutRepoArgs` strips only `repoName`/`app`.
- Pattern: `tests/mcpEntityTools.test.ts` (fixture), `tests/artifactState.test.ts` (convex-test basics).
- Command: `pnpm --filter @eva/backend test -- tests/mcpSupabaseToken.test.ts` → all pass.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `pnpm --filter @eva/backend test -- tests/mcpSupabaseToken.test.ts tests/mcpEntityTools.test.ts tests/mcpCodeModeTools.test.ts` passes
- [ ] `grep -n "supabaseTokenCache.set(clerkUserId," packages/backend/convex/mcp/nodeActions.ts` → no matches (cache keyed by user and repo)
- [ ] `grep -n "interface McpCredentials" packages/backend/convex/mcp/supabase.ts` → no matches
- [ ] `pnpm lint` exits 0
- [ ] `docs/mcp-security.md` and `internal/changelog.md` updated
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated, if that file exists

## STOP conditions

Stop and report back (do not improvise) if:

- `resolveSupabaseToken` has callers other than `convex/mcp/supabase.ts` (`grep -rn resolveSupabaseToken packages/backend/convex | grep -v _generated`).
- A discovered Supabase tool already has an input property named `repoName` or `app` (Step 4 would shadow it). Report the tool name; a different arg name is the operator's call.
- The operator prefers to drop Supabase tools for unscoped clients instead of Step 4 (simpler, but external MCP clients lose them). Ask before Step 4 if you have any instruction suggesting this.
- `entityAccess(...).assertRepoAccess` or `resolveRepoRef` has a different signature than in "Current state".
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Multi-repo sessions: `scopedRepoId` is the primary repo, so a sandbox only sees the primary repo's Supabase token. Linked repos' Supabase projects are not reachable through these tools. That matches the pin rule for other repo credentials.
- `findSupabaseRepoId` still decrypts env vars across the user's repos, but only to pick a token for tool **discovery** for a non-sandbox client, who can reveal those values in the web app anyway. The token is never returned to the client.
- `toolDefinitionCache` is keyed by token; two repos with different tokens may expose slightly different tool lists. Acceptable.
- Reviewers: check the forwarded Supabase args no longer contain `repoName`/`app`, and that no code path resolves a token without a `repoId`.
