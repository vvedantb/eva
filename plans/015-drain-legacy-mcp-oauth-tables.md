# Plan 015: Drain and drop the unused legacy MCP OAuth tables

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (if that file exists) — unless a reviewer dispatched
> you and told you they maintain the index.
>
> **This plan has an operator step in the middle.** Phase A (Steps 1–3) is
> code you write and commit. Then you STOP. The operator deploys and runs the
> migrations. Phase B (Steps 4–6) is a later session, started only after the
> operator confirms the tables are empty on dev and prod. **You must never run
> a migration, `npx convex run`, `npx convex codegen`, `convex dev` or
> `convex deploy` yourself.**
>
> **Drift check (run first)**: `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/schema.ts packages/backend/convex/dataMigrations.ts docs/mcp-security.md internal/changelog/2026-11.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (`schema.ts`,
> `dataMigrations.ts` and the changelog change often; only the lines quoted
> below matter.)

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (Phase A adds code only; Phase B is gated on an empty table)
- **Depends on**: none
- **Category**: tech-debt (security hygiene)
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

Eva moved MCP OAuth to Clerk. Its own OAuth server (`mcp/oauth.ts`, the
`/mcp/oauth/register|authorize|token` routes) was removed, but its two tables,
`mcpAuthCodes` and `mcpClientRegistrations`, stay in the schema and in the
database. Nothing reads or writes them. `mcpClientRegistrations` has a
`clientSecret` column, so dead OAuth client credentials sit in production
data, in every prod-to-dev sync, and in backups made from now on. This plan
deletes the rows with a migration, then removes the tables, following the
same path the repo used for `mcpTokenCache` in October 2026.

## Current state

Files:

- `packages/backend/convex/schema.ts:610-630` — the two tables and the
  previous drain's marker:

```ts
  // Unused after Clerk MCP OAuth. Kept until a drain migration removes them.
  mcpAuthCodes: defineTable({
    code: v.string(),
    clerkUserId: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
    redirectUri: v.string(),
    clientId: v.string(),
    expiresAt: v.number(),
  }).index("by_code", ["code"]),

  // Unused after Clerk MCP OAuth. Kept until a drain migration removes them.
  mcpClientRegistrations: defineTable({
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
    redirectUris: v.array(v.string()),
    registeredAt: v.number(),
  }).index("by_clientId", ["clientId"]),

  // MCP bearer token-cache table removed after the drain migration emptied it.
  // schema-narrowing-ok: drainMcpTokenCache
```

- `packages/backend/convex/dataMigrations.ts` — `@convex-dev/migrations`
  definitions. `dataMigrations.define({ table, migrateOne })` per table;
  `dataMigrations.runner([...])` chains several (example:
  `pruneBackgroundAgents`, lines 360–366, with a `/** npx convex run --prod dataMigrations:pruneBackgroundAgents */` doc line).
- `docs/mcp-security.md:64` — the "Unused tables" line to update:

```markdown
- **Unused tables**: `mcpTokenCache` was drained by `dataMigrations:drainMcpTokenCache` and removed from the schema. `mcpAuthCodes` and `mcpClientRegistrations` stay in the schema until a drain migration removes them.
```

- Only references in tracked source: the schema lines above,
  `docs/mcp-security.md:64`, and history in `internal/changelog/2026-10.md:177`
  and `internal/plans/implemented/migrate-mcp-railway-to-vercel.md`. No
  function reads either table
  (`grep -rn "mcpAuthCodes\|mcpClientRegistrations" packages/backend/convex --include=*.ts | grep -v _generated`
  shows only `schema.ts`).

### Precedent: `mcpTokenCache` (`git log -S drainMcpTokenCache`)

- `85011982e feat(mcp): verify Clerk JWT access tokens locally (#1023)` added
  to `dataMigrations.ts`:

  ```ts
  /** Deletes every mcpTokenCache row. Auth no longer writes the cache. */
  export const drainMcpTokenCache = dataMigrations.define({
    table: "mcpTokenCache",
    migrateOne: async (ctx, row) => {
      await ctx.db.delete(row._id);
    },
  });
  ```

- After it ran on prod, `9e67fe239 chore(schema): remove drained mcpTokenCache table (#1024)`
  removed the table definition, replaced it with the two-line marker comment
  shown above, deleted the migration, and updated `docs/mcp-security.md` and
  the changelog.

### The CI gate: `scripts/check-schema-narrowing.mjs`

From its header (lines 1–20): it "Fails CI when a diff removes a Convex
schema field, table, or union member without a migration that first drains
the live rows still holding it." "Escape hatch: put
`// schema-narrowing-ok: <migrationName>` on or next to the removal, and
export a matching migration from convex/dataMigrations.ts."

Facts from reading `main()` (lines 205–297) that change how you work:

- It diffs `git merge-base origin/main HEAD` against **HEAD (committed)**. Run
  it only after committing; uncommitted edits are not checked.
- A marker's migration must be exported from `dataMigrations.ts` in **HEAD or
  in the merge-base**. So the migration may be deleted only once the commit
  that added it is on `origin/main`. This is why Phase B starts with that
  check.
- Do **not** edit or delete the existing
  `// schema-narrowing-ok: drainMcpTokenCache` line. A removed line that holds
  a marker counts as a marker, and `drainMcpTokenCache` no longer exists, so
  the gate would fail with "missing-migration".

### Conventions that apply (quoted)

From `docs/eva-convex.md` > Migrations:

- "When asked to run a migration that removes a field: add a migration that clears docs with that field → run it → remove fields from schema → delete the migration function."
- "Prefer the `convex-migration-helper` skill for non-trivial migrations."

From `CLAUDE.md`:

- "No `any`, `unknown`, `as`, or non-null `!`."
- "Only edit this file when the user explicitly asks." (do not edit `CLAUDE.md`)
- "After medium+ changes: … `/changelog` (or `internal/changelog.md`)."

Changelog convention (`internal/changelog/README.md`): "New entries go at the
**top** of the current month's file, directly under its `# Changelog — <Month
YYYY>` heading. … Entry format: `## <Title> - <YYYY-MM-DD>` followed by
bullets describing what changed and why."

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `pnpm --filter @eva/backend typecheck` | exit 0, no errors |
| Schema gate | `node scripts/check-schema-narrowing.mjs` (after committing) | exit 0, prints `check-schema-narrowing: OK — …` |
| Gate self-test | `pnpm test:schema-narrowing` | all pass |
| Migration guard test | `pnpm --filter @eva/backend test -- tests/convexHotPathIoContract.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

Operator-only (the executor must NOT run these; they are listed so you can
hand them over verbatim):

| Purpose | Command |
|---------|---------|
| Dry run on dev | `cd packages/backend && npx convex run dataMigrations:drainMcpAuthCodes '{dryRun: true}'` and the same for `drainMcpClientRegistrations` |
| Run on dev | `cd packages/backend && npx convex run dataMigrations:drainLegacyMcpOAuthTables` |
| Run on prod | `cd packages/backend && npx convex run --prod dataMigrations:drainLegacyMcpOAuthTables` |
| Watch progress | `npx convex run --component migrations lib:getStatus --watch` (add `--prod` for prod) |
| Confirm empty | `npx convex data mcpAuthCodes --limit 1` and `npx convex data mcpClientRegistrations --limit 1` (add `--prod`) → no rows |

(Command shapes come from the doc comment at `dataMigrations.ts:22-38`.)

## Suggested executor toolkit

- `convex-migration-helper` skill (named in `docs/eva-convex.md`).
- Read `git show 85011982e -- packages/backend/convex/dataMigrations.ts` and
  `git show 9e67fe239` before starting; this plan repeats them.

## Scope

**In scope** (the only files you should modify):

- `packages/backend/convex/dataMigrations.ts`
- `packages/backend/convex/schema.ts` (only lines 610–627 and their comments)
- `docs/mcp-security.md` (line 64 only)
- `internal/changelog/2026-11.md` (or the current month's file)

**Out of scope** (do NOT touch):

- The `// schema-narrowing-ok: drainMcpTokenCache` comment at `schema.ts:629-630`.
- `internal/changelog/2026-10.md` and `internal/plans/implemented/*` — history.
- `packages/backend/convex/_generated/*` — never hand-edit, never run codegen.
  Adding exports to an existing module needs no codegen: `api.d.ts` types
  `dataMigrations` with `typeof import(...)`.
- `packages/backend/.convex/local/…` (git-ignored local backend data).
- Any MCP auth code — it no longer touches these tables.

## Git workflow

- Stay on the current branch. Do NOT create a branch, push, or open a PR
  unless the operator told you to.
- Phase A: one commit, e.g.
  `chore(mcp): add drain migrations for legacy MCP OAuth tables`.
- Phase B: two commits, e.g.
  `chore(schema): remove drained legacy MCP OAuth tables` then
  `chore(migrations): delete the MCP OAuth drain migrations`.
  (Style from `git log`: `chore(schema): remove drained mcpTokenCache table (#1024)`.)

## Steps

### Phase A — add the drain (this session)

#### Step 1: Add the migrations

Append to the end of `packages/backend/convex/dataMigrations.ts`:

```ts
/**
 * Deletes every `mcpAuthCodes` row. Eva's own MCP OAuth server is gone (Clerk
 * issues MCP tokens), so nothing reads or writes this table.
 */
export const drainMcpAuthCodes = dataMigrations.define({
  table: "mcpAuthCodes",
  migrateOne: async (ctx, row) => {
    await ctx.db.delete(row._id);
  },
});

/**
 * Deletes every `mcpClientRegistrations` row, including the dead OAuth client
 * secrets they hold. Same reason as `drainMcpAuthCodes`.
 */
export const drainMcpClientRegistrations = dataMigrations.define({
  table: "mcpClientRegistrations",
  migrateOne: async (ctx, row) => {
    await ctx.db.delete(row._id);
  },
});

/** `npx convex run --prod dataMigrations:drainLegacyMcpOAuthTables` */
export const drainLegacyMcpOAuthTables = dataMigrations.runner([
  internal.dataMigrations.drainMcpAuthCodes,
  internal.dataMigrations.drainMcpClientRegistrations,
]);
```

`internal` is already imported at line 2.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0. If the
`internal.dataMigrations.drainMcpAuthCodes` references fail to typecheck,
STOP (do not run codegen to fix it).

#### Step 2: Point the schema comments and docs at the migration

1. In `schema.ts`, change both comments (lines 610 and 621) from
   `// Unused after Clerk MCP OAuth. Kept until a drain migration removes them.`
   to
   `// Unused after Clerk MCP OAuth. dataMigrations:drainLegacyMcpOAuthTables empties it; a follow-up removes the table.`
   Change nothing else in the schema.
2. In `docs/mcp-security.md:64`, replace the second sentence so the line reads:

   ```markdown
   - **Unused tables**: `mcpTokenCache` was drained by `dataMigrations:drainMcpTokenCache` and removed from the schema. `mcpAuthCodes` and `mcpClientRegistrations` (which holds dead OAuth client secrets) are emptied by `dataMigrations:drainLegacyMcpOAuthTables`; the tables are removed once it has run on dev and prod.
   ```

3. Add at the top of `internal/changelog/2026-11.md`:

   ```markdown
   ## Drain migrations for the legacy MCP OAuth tables - <YYYY-MM-DD>

   - `dataMigrations:drainLegacyMcpOAuthTables` deletes every `mcpAuthCodes` and `mcpClientRegistrations` row. Both tables are unused since MCP OAuth moved to Clerk; registrations hold dead OAuth client secrets.
   - Run it on dev and prod, then a follow-up removes both tables from the schema (same path as `mcpTokenCache`).
   ```

**Verify**: `pnpm lint` → exit 0; `pnpm --filter @eva/backend test -- tests/convexHotPathIoContract.test.ts` → pass.

#### Step 3: Commit and hand over to the operator

Commit Phase A. Then run `node scripts/check-schema-narrowing.mjs` → exit 0
with `OK — no schema narrowing` (nothing was removed).

**STOP here.** Report to the operator:

> Phase A of plan 015 is committed (`<sha>`). Please merge it to `main`,
> deploy, then run on **dev and prod**: dry run, run, and confirm both tables
> are empty (commands in the plan's "Operator-only" table). If you use a local
> backend or ran `sync:prod-to-dev` before the drain, drain those copies too.
> Tell me when both deployments report zero rows; Phase B removes the tables.

Update `plans/README.md` (if it exists) to
`BLOCKED (waiting for operator to run drainLegacyMcpOAuthTables on dev + prod)`.

### Phase B — remove the tables (later session, after operator confirmation)

#### Step 4: Check the preconditions

All must hold, or STOP:

1. The operator has confirmed, in writing in this session, that both tables
   have zero rows on dev **and** prod.
2. `git fetch origin main` then
   `git show origin/main:packages/backend/convex/dataMigrations.ts | grep -c "export const drainMcpAuthCodes\|export const drainMcpClientRegistrations"`
   → `2`. (The gate needs the migrations in the merge-base before you delete
   them.)

#### Step 5: Remove the two tables

In `schema.ts`, delete the two comment lines and both `defineTable(...)`
blocks (today lines 610–627). Put this in their place, directly above the
existing `mcpTokenCache` marker comment:

```ts
  // Legacy MCP OAuth tables removed after the drain migrations emptied them.
  // schema-narrowing-ok: drainMcpAuthCodes
  // schema-narrowing-ok: drainMcpClientRegistrations
```

Leave the `drainMcpTokenCache` lines untouched. In `docs/mcp-security.md:64`,
make the line:

```markdown
- **Unused tables**: `mcpTokenCache`, `mcpAuthCodes` and `mcpClientRegistrations` were drained by data migrations and removed from the schema.
```

Commit. Then:

**Verify**:
- `pnpm --filter @eva/backend typecheck` → exit 0.
- `node scripts/check-schema-narrowing.mjs` → exit 0, prints
  `OK — <n> removal(s) covered by migration(s): drainMcpAuthCodes, drainMcpClientRegistrations` (or a subset).
- `grep -rn "mcpAuthCodes\|mcpClientRegistrations" packages/backend/convex --include=*.ts | grep -v _generated`
  → only the `dataMigrations.ts` table names remain.

#### Step 6: Delete the migrations

Delete the three exports added in Step 1 from `dataMigrations.ts`. Add at the
top of `internal/changelog/2026-11.md` (current month's file):

```markdown
## Legacy MCP OAuth tables removed - <YYYY-MM-DD>

- After `drainLegacyMcpOAuthTables` emptied them on dev and prod, `mcpAuthCodes` and `mcpClientRegistrations` left the schema and the drain migrations were deleted. Marker: `schema-narrowing-ok: drainMcpAuthCodes`, `drainMcpClientRegistrations`.
```

Commit.

**Verify**:
- `pnpm --filter @eva/backend typecheck` → exit 0.
- `node scripts/check-schema-narrowing.mjs` → exit 0 (the merge-base still
  exports the migrations).
- `pnpm test:schema-narrowing` → pass; `pnpm lint` → exit 0.
- `grep -rn "mcpAuthCodes\|mcpClientRegistrations" packages/backend/convex --include=*.ts | grep -v _generated`
  → no output.

## Test plan

- No new unit tests: the migrations are one-line deletes copied from a
  shipped precedent, and the table has no readers.
- Gates: typecheck, `check-schema-narrowing` (after each commit),
  `pnpm test:schema-narrowing`, and
  `tests/convexHotPathIoContract.test.ts` (it reads `dataMigrations.ts`).
- The real check is the operator's "confirm empty" commands on dev and prod
  before Phase B.

## Done criteria

Phase A:

- [ ] `drainMcpAuthCodes`, `drainMcpClientRegistrations`, `drainLegacyMcpOAuthTables` exported from `dataMigrations.ts`
- [ ] `pnpm --filter @eva/backend typecheck` and `pnpm lint` exit 0
- [ ] `node scripts/check-schema-narrowing.mjs` exits 0 after the commit
- [ ] `docs/mcp-security.md:64` names the drain migration; changelog entry added
- [ ] You did not run any `npx convex …` command
- [ ] `plans/README.md` row (if the file exists) set to BLOCKED on the operator

Phase B:

- [ ] Operator confirmation of zero rows on dev and prod recorded in the session
- [ ] Both tables gone from `schema.ts`; markers present; `drainMcpTokenCache` marker untouched
- [ ] `grep -rn "mcpAuthCodes\|mcpClientRegistrations" packages/backend/convex --include=*.ts | grep -v _generated` → no output
- [ ] `node scripts/check-schema-narrowing.mjs` exits 0 after each commit
- [ ] `git status` clean; only in-scope files changed
- [ ] `plans/README.md` row (if the file exists) set to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The schema excerpt does not match (drift), or a function in
  `packages/backend/convex` now reads or writes either table.
- Typecheck fails on the new `internal.dataMigrations.*` references. Do not
  run `npx convex codegen` to fix it.
- You are about to run any `npx convex run`, `convex dev`, `convex deploy` or
  `codegen` command. That is the operator's job.
- In Phase B, the operator has not confirmed zero rows on **both** dev and
  prod, or `origin/main` does not export the migrations yet.
- `check-schema-narrowing` fails with `missing-migration` or `unmarked`.
  Do not add markers for migration names that do not exist.

## Maintenance notes

- Removing a table that still holds rows fails the Convex deploy (schema
  validation). That is why Phase B waits for the operator.
- The `clientSecret` values in `mcpClientRegistrations` belonged to OAuth
  clients of an authorization server that no longer exists, so they grant
  nothing today. Deleting them is hygiene, not an incident. Backups or
  exports taken before the drain still hold them; let them age out under the
  normal retention policy. Do not copy any value into tickets or logs.
- Reviewer: check that Phase B did not touch the `drainMcpTokenCache` marker
  and that each marker names a migration that `origin/main` exports.
