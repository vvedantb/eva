# Plan 005: `users.get` returns a full profile only for self and teammates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/users.ts packages/backend/convex/functions.ts packages/backend/tests/usersGetAccess.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

`api.users.get` is a public Convex query. Any signed-in user can pass any
`users` id and get back that user's email, platform role, last-seen time and
last-seen path (the URL they are looking at). There is no check that the two
users have anything in common. User ids leak easily (they appear in shared
documents, comments, task data), so this is a cross-tenant leak of personal
data and live activity. After this plan, the caller gets the full profile only
for themself or for a user who shares at least one team with them; for anyone
else the query returns name fields only, which is what `users.getMany` already
exposes.

## Current state

Files:

- `packages/backend/convex/users.ts` — user queries. `get` at lines 37–68 is the
  leak. `getMany` at lines 274–288 returns name + role for any id (lower
  sensitivity; out of scope, see Maintenance notes).
- `packages/backend/convex/functions.ts` — shared access helpers
  (`getTeamMembership` line 100, `hasTeamAccess` line 114). There is **no**
  existing "do these two users share a team" helper; this plan adds one here,
  next to `hasTeamAccess`. These helpers were centralised by commit
  `2643e0857 refactor(backend): centralise team/repo/doc/session access checks (#1112)`.
- `packages/backend/tests/artifactState.test.ts` — the convex-test pattern to copy.

`packages/backend/convex/users.ts:37-68` today:

```ts
/** Fetches a user's public profile (name, last seen) by their ID. */
export const get = authQuery({
  args: { id: v.id("users") },
  returns: v.union(
    v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      fullName: v.optional(v.string()),
      email: v.optional(v.string()),
      role: v.optional(roleUserValidator),
      lastSeenAt: v.optional(v.number()),
      lastSeenPath: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) return null;
    const seen = mergeLastSeen(
      await getUserPresenceRow(ctx.db, args.id),
      user,
    );
    return {
      firstName: user.firstName,
      ...
      email: user.email,
      role: user.role,
      lastSeenAt: seen.lastSeenAt,
      lastSeenPath: seen.lastSeenPath,
    };
  },
});
```

`packages/backend/convex/functions.ts:99-121` today (helpers to reuse):

```ts
/** Fetches a user's membership row for a team, or null if they aren't a member. */
export function getTeamMembership(db, teamId, userId) { ... withIndex("by_team_and_user", ...) .first(); }

/** Checks if a user has access to a team — i.e. is a member of it. */
export async function hasTeamAccess(
  db: GenericDatabaseReader<DataModel>,
  teamId: Id<"teams">,
  userId: Id<"users">,
): Promise<boolean> {
  return (await getTeamMembership(db, teamId, userId)) !== null;
}
```

`teamMembers` table (`packages/backend/convex/schema.ts:507-516`) has indexes
`by_user` (`["userId"]`) and `by_team_and_user` (`["teamId","userId"]`).
`authQuery` (`functions.ts:494`) injects `ctx.userId: Id<"users">`.

Web callers of `api.users.get` (all read fields that stay available to
teammates; none needs a change — every returned field is already optional):

| Caller | Fields read |
|---|---|
| `packages/shared/src/components/user-initials.tsx:55,195` (avatar + profile hover card) | names, `email`, `role`, `lastSeenAt` |
| `apps/web/src/lib/components/FollowOverlay.tsx:36` (follow a teammate) | `lastSeenAt`, `lastSeenPath` |
| `apps/web/src/lib/components/sidebar/SidebarListHoverCard.tsx:46,70` | names, `email` |
| `apps/web/src/lib/components/docs/_components/DocCommentThread.tsx:253` | names, `email` (display-name fallback) |
| `apps/web/src/lib/components/docs/_components/DocSuggestionsPanel.tsx:227` | names, `email` (display-name fallback) |
| `apps/web/src/lib/components/tasks/_components/CommentActivityItem.tsx:62` | names |
| `apps/web/src/lib/components/projects/ProjectSandboxChatPanel.tsx:88` (project owner) | names |

All of these show people the viewer already collaborates with (team docs,
team tasks, team projects, the team sidebar). A user who left the team still
shows a name, because non-teammates get name fields.

Conventions that apply (quoted from `CLAUDE.md` / `docs/eva-convex.md`):

- "No `any`, `unknown`, `as`, or non-null `!`."
- "Prefer simplicity, small diffs, co-location, explicit behavior ... No premature abstractions."
- "Eliminate duplication, centralise your changes so its easier to update them" — put the new helper in `functions.ts` beside `hasTeamAccess`, not inline in `users.ts`.
- "Always import: `Doc<"tableName">`, `Id<"fieldName">` ... Never duplicate schema types manually."
- "Before a PR that touches async code, run `/parallel-awaits`" — the new helper must not await team checks one by one in a loop.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Web typecheck | `pnpm --filter @eva/web typecheck` | exit 0 |
| New test | `pnpm --filter @eva/backend test -- tests/usersGetAccess.test.ts` | all pass |
| Related test | `pnpm --filter @eva/backend test -- tests/directory.test.ts tests/artifactState.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

Do NOT run `npx convex codegen`, `convex dev` or `convex deploy`. Do not run the
whole backend suite: 5 tests already fail at planning time (pendingQuestion,
sessionStopRecoveryContract x3, providerAccountHandoffContract) and are not
yours to fix.

## Suggested executor toolkit

- `convex-rules` skill if available, for query/validator style.
- `parallel-awaits` skill (`--diff origin/main`) before any PR.
- `changelog` skill for the changelog entry.

## Scope

**In scope** (the only files you should modify):

- `packages/backend/convex/functions.ts` — add `sharesTeam`.
- `packages/backend/convex/users.ts` — gate `get`.
- `packages/backend/tests/usersGetAccess.test.ts` (create).
- `internal/changelog/2026-11.md` — one entry at the top.

**Out of scope** (do NOT touch):

- `users.getMany` / `listAll` — `getMany` returns names + role only and is
  used by chat transcripts with ids from team data; changing it needs its own
  caller review.
- Any web or `packages/shared` component — the return validator is unchanged
  and every field is already optional, so callers keep compiling.
- The `returns` validator of `get` — keep it as is so `FunctionReturnType<typeof api.users.get>` stays the same for the 7 callers.

## Git workflow

- Stay on the current branch. Do not create a branch, push, or open a PR unless the operator tells you to.
- One commit, conventional style, e.g. `fix(backend): limit users.get full profile to self and teammates`.

## Steps

### Step 1: Add `sharesTeam` to `functions.ts`

Insert directly after `hasTeamAccess` (after line 121):

```ts
/**
 * True when `userId` is `otherUserId` or both are members of at least one
 * common team. Gates profile fields (email, presence) between users.
 */
export async function sharesTeam(
  db: GenericDatabaseReader<DataModel>,
  userId: Id<"users">,
  otherUserId: Id<"users">,
): Promise<boolean> {
  if (userId === otherUserId) return true;
  const memberships = await db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const shared = await Promise.all(
    memberships.map((membership) =>
      hasTeamAccess(db, membership.teamId, otherUserId),
    ),
  );
  return shared.includes(true);
}
```

No casts. `GenericDatabaseReader`, `DataModel`, `Id` are already imported in this file.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 2: Gate `users.get`

In `packages/backend/convex/users.ts`:

1. Add `import { sharesTeam } from "./functions";` — merge into the existing `import { authQuery } from "./functions";` line (line 5) as `import { authQuery, sharesTeam } from "./functions";`.
2. In `get`'s handler, after `if (!user) return null;`, add:

```ts
    // Email, role and presence (incl. the page they are on) are for
    // teammates only. Anyone else sees the name, as getMany already shows.
    if (!(await sharesTeam(ctx.db, ctx.userId, args.id))) {
      return {
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
      };
    }
```

3. Update the doc comment on line 37 to:
   `/** A user's profile. Email, role and last seen only for self or a teammate; names otherwise. */`

Do not change the `returns` validator.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0; `pnpm --filter @eva/web typecheck` → exit 0.

### Step 3: Add the convex-test file

Create `packages/backend/tests/usersGetAccess.test.ts`, modelled on
`packages/backend/tests/artifactState.test.ts` (same imports:
`convexTest` from `convex-test`, `api` from `../convex/_generated/api`,
`schema` from `../convex/schema`, `const modules = import.meta.glob("../convex/**/*.ts");`,
a 30 s timeout per test).

Fixture: insert users ALICE, BOB, STRANGER (each with `clerkId`, `email`,
`firstName`, `role` left unset, `lastSeenAt: 1`, `lastSeenPath: "/x"`), one team
created by ALICE, `teamMembers` rows for ALICE and BOB (`role: "member"`,
`joinedAt: now`). Use `t.withIdentity({ subject: <clerkId> })` per user.

Cases:

1. Alice reads Bob (teammate) → result has `email` equal to Bob's email and `lastSeenPath === "/x"`.
2. Alice reads herself → `email` present.
3. Stranger reads Alice → `toEqual({ firstName: "Alice", lastName: undefined, fullName: undefined })` or, more robustly, assert `email`, `role`, `lastSeenAt`, `lastSeenPath` are all `undefined` and `firstName === "Alice"`.
4. Alice reads a deleted user (insert then `ctx.db.delete`) → `null`.
5. A `userPresence` row for Bob (`userId: bob, lastSeenAt: 2, lastSeenPath: "/secret"`) is NOT visible to Stranger (`lastSeenPath` undefined) but IS visible to Alice (`"/secret"`). Check `userPresenceFields` in `packages/backend/convex/_validators/tableFields.ts` for required fields before inserting.

**Verify**: `pnpm --filter @eva/backend test -- tests/usersGetAccess.test.ts` → 5 tests pass.

### Step 4: Changelog and lint

Add an entry at the top of `internal/changelog/2026-11.md`, directly under the
`# Changelog — November 2026` heading (format from `internal/changelog/README.md`):

```
## users.get hides email and presence from non-teammates - 2026-11-09

- Cause: `users.get` returned email, role, lastSeenAt and lastSeenPath for any user id to any signed-in user.
- Now full profile only for self or a user sharing a team (`sharesTeam` in `functions.ts`); others get name fields only. Test: `tests/usersGetAccess.test.ts`.
```

Use today's date if it differs.

**Verify**: `pnpm lint` → exit 0. `git status --short` → only the 4 in-scope files.

## Test plan

- New: `packages/backend/tests/usersGetAccess.test.ts`, 5 cases listed in Step 3 (teammate full, self full, stranger names only, deleted → null, presence row hidden from stranger).
- Pattern: `packages/backend/tests/artifactState.test.ts`.
- Regression: `pnpm --filter @eva/backend test -- tests/directory.test.ts tests/artifactState.test.ts` → all pass.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `pnpm --filter @eva/web typecheck` exits 0
- [ ] `pnpm --filter @eva/backend test -- tests/usersGetAccess.test.ts` passes, 5 tests
- [ ] `grep -n "sharesTeam" packages/backend/convex/users.ts` returns a match inside `get`
- [ ] `grep -rnE "\bas [A-Z]|: any\b|: unknown\b" packages/backend/tests/usersGetAccess.test.ts` returns no matches
- [ ] `pnpm lint` exits 0
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- `users.get` or `hasTeamAccess` does not match the excerpts above.
- A `sharesTeam`-like helper already exists in `functions.ts` or `_auth/` by then — reuse it instead and report.
- `pnpm --filter @eva/web typecheck` fails in any `api.users.get` caller — it means the return type changed; do not edit callers, report.
- convex-test cannot insert the fixture because `users`/`teams`/`userPresence` require fields not listed here, and adding them is not obvious from the validators.
- A product requirement surfaces that non-teammates must see email (e.g. a shared-doc guest flow) — report rather than widening the gate.

## Maintenance notes

- Any new "cross-team" sharing feature (guests on docs, public projects) will show guests name-only profiles. If guests need avatars with presence, extend `sharesTeam` deliberately, not `get`.
- Reviewer: check the stranger branch returns no `email`, `role`, `lastSeenAt`, `lastSeenPath`, and that `sharesTeam` uses indexed reads only.
- Deferred: `users.getMany` returns name + `role` for any id. Lower risk (no email/presence). A follow-up can apply `sharesTeam` per id there; it needs a review of the chat transcript caller (`apps/web/src/lib/components/chat/ChatBody.tsx:773`).
- Existence oracle: a stranger can still learn that an id is a user and its name. Same as `getMany` today; accepted.
