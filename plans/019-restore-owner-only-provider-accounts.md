# Plan 019: Only the task creator or project owner can change the billed account in task and project chats

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 478be7912..HEAD -- packages/backend/convex/_userProviderAccounts/defaults.ts packages/backend/convex/_sessions/execution.ts packages/backend/convex/_queues/helpers.ts packages/backend/convex/_sessionChats/mutations.ts packages/backend/convex/userProviderAccounts.ts apps/web/src/lib/components/chat/useOwnedChatBinding.ts apps/web/src/lib/components/chat/sandboxChatBinding.ts apps/web/src/lib/components/chat/SandboxChatPanel.tsx apps/web/src/lib/components/tasks/TaskSandboxChatPanel.tsx apps/web/src/lib/components/projects/ProjectSandboxChatPanel.tsx packages/backend/tests/ownedSessionProviderAccount.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (backend S; the web gate makes it M)
- **Risk**: MED — this reverses a product change made on the same day (see Step 0)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `478be7912`, 2026-11-12

## Why this matters

A chat turn runs on one person's provider credentials and bills that person.
Before phase 3a (commit `a5dfe2d6d`), task chat and project chat were
"owner-sticky": only the task creator or the project owner could change which
of their accounts a turn used. Phase 3a moved both chats onto hidden "owned
sessions" and deleted every `"owner-only"` caller. Now every session chat uses
the `"owner-pool"` policy, so any repo collaborator can switch a teammate's task
or project chat between that teammate's accounts (their own accounts and
accounts other people shared with them). The collaborator cannot attach their
own account, but they can move the spend to another of the owner's
subscriptions without the owner's consent. After this plan, a standalone
session keeps today's rule, and a task or project session is owner-only again.

## Current state

### Step 0 context — a same-day commit made the opposite choice

Commit `293d6d0dd` ("task: why canti change to someone elses claude account i",
2026-11-12 16:32, after `a5dfe2d6d`) deliberately let collaborators switch the
account in quick-task and project chats. Its entry in `internal/changelog.md:19`:

```
## Collaborators can switch the account in quick task and project chats
...
WHY: In a teammate's quick task chat, picking another account did nothing. `SandboxChatPanel` returned early unless the viewer created the task. The session chat and `sessionChats.setProviderAccountId` already let any repo collaborator switch among the owner's accounts.
```

That commit removed `isOwner` and `pickerAccounts` from the web binding, set
`canSwitchAccount: true`, and added `userProviderAccounts.listForProjectOwner`.
This plan restores owner-only in the backend **and** the web, so it reverses
that UI change. Step 0 asks the operator to confirm.

### Backend files

- `packages/backend/convex/_userProviderAccounts/defaults.ts` — account rules.
  `resolveTurnProviderAccountId` (lines 76–140) still has both policies, but
  `grep -rn '"owner-only"' packages/backend/convex` finds only this file.

```ts
// defaults.ts:76-114
/**
 * Resolves the account a chat turn should run on. Project and task chat are
 * owner-sticky: only the owner may point the turn at a different account.
 * Session chat lets anyone with access pick from the owner's pool. ...
 */
export async function resolveTurnProviderAccountId(
  db: GenericDatabaseReader<DataModel>,
  args:
    | (TurnProviderAccountBase & {
        changePolicy: "owner-only";
        currentAccountId: Id<"userProviderAccounts"> | undefined;
        senderUserId: Id<"users">;
        ownerNoun: "project owner" | "task owner";
      })
    | (TurnProviderAccountBase & {
        changePolicy: "owner-pool";
      }),
): Promise<Id<"userProviderAccounts"> | undefined> {
  if (args.changePolicy === "owner-only") {
    const requested = args.requestedAccountId;
    if (requested === undefined) {
      // The entity's stored account is server state, not a caller pick, so a
      // stale id (owner deleted the account) degrades to the owner's default
      // for this model rather than failing the turn.
      return await reconcileUsableAccountForModel(
        db, args.ownerUserId, args.model, args.currentAccountId,
      );
    }
    if (
      args.senderUserId !== args.ownerUserId &&
      requested !== args.currentAccountId
    ) {
      throw new Error(
        `Only the ${args.ownerNoun} can change the provider account`,
      );
    }
```

  Note the two meanings of `requestedAccountId === undefined`: under
  `"owner-pool"` it means **Team**; under `"owner-only"` it means **keep the
  current account**.

- `packages/backend/convex/_sessions/execution.ts` — session chat turns.
  - `stageAndStartChatTurn`, lines 94–101 (used by `startExecute`,
    `retryLastTurnWithAccount` and the internal `retryEmptyStalledSessionTurn`):

    ```ts
    const [stickyProviderAccountId, user] = await Promise.all([
      resolveTurnProviderAccountId(ctx.db, {
        requestedAccountId: settings.providerAccountId,
        ownerUserId: session.createdBy ?? session.userId,
        model: settings.model,
        changePolicy: "owner-pool",
      }),
      ctx.db.get(params.actingUserId),
    ]);
    ```

  - `enqueueChatMessage`, lines 215–220 (used by `sendSessionChatMessage`,
    which `enqueueMessage`, `mobile.sendMessage` (`mobile.ts:103`) and the MCP
    send path call): same call with `changePolicy: "owner-pool"`.
  - `retryLastTurnWithAccount`, lines 313–370: checks only `hasRepoAccess`
    (line 323), then passes `providerAccountId = args.providerAccountId ?? undefined`
    (line 339; `null` = Team) to `stageAndStartChatTurn`.
  - `retryEmptyStalledSessionTurn` (line 253) acts as the owner
    (`const actingUserId = session.createdBy ?? session.userId;`, line 279) and
    passes `chat.providerAccountId`. It needs no change.
- `packages/backend/convex/_queues/helpers.ts:594-601` — queue drain:

  ```ts
  // The queued model may belong to another provider than the stored pick.
  turnAccountId: (ctx, { session }, next) =>
    resolveTurnProviderAccountId(ctx.db, {
      requestedAccountId: next.providerAccountId,
      ownerUserId: session.createdBy ?? session.userId,
      model: next.model,
      changePolicy: "owner-pool",
    }),
  ```

  A throw here does not strand the queue (lines 427–444 delete the row and post
  an error bubble), but pre-3a dropped a collaborator's stored pick instead of
  throwing (see below).
- `packages/backend/convex/_sessionChats/mutations.ts:168-197` —
  `setProviderAccountId` (`api.sessionChats.setProviderAccountId`):

  ```ts
   * Anyone with repo access may pick, but only from accounts owned by the
   * session owner — a session always runs on one person's credentials, and a
   * collaborator must never be able to attach their own.
   */
  export const setProviderAccountId = authMutation({
    ...
      const { chat, session } = await getSessionChatWithAccess(ctx.db, args.chatId, ctx.userId);
      const providerAccountId = await assertProviderAccountUsableBy(
        ctx.db, args.providerAccountId, session.createdBy ?? session.userId,
      );
      await ctx.db.patch(chat._id, { providerAccountId });
  ```

- The rule survives on the task record: `_agentTasks/updateTask.ts:120-125`
  ("Only the task owner may set a personal account") and the project record:
  `_projects/mutations.ts:157-162`. Leave both.
- `packages/backend/convex/_sessions/owner.ts:17-21` — `sessions.owner` is
  `{ kind: "standalone" } | { kind: "task", taskId } | { kind: "project", projectId }`.
  It is set at insert and never changes.
- `packages/backend/convex/_sessions/ownedSession.ts:216-237` — an owned
  session's `userId`/`createdBy` is `task.createdBy` (quick task) or
  `project.userId` (project). Every chat turn bills
  `session.createdBy ?? session.userId` (`execution.ts:103`,
  `credentialOwnerUserId`).

### Pre-3a semantics (from `git show a5dfe2d6d`)

All task-chat and project-chat send paths (`addMessage`, `startExecute`,
`sendTaskChatMessage`, `sendProjectChatMessage`) used:

```ts
resolveTurnProviderAccountId(ctx.db, {
  requestedAccountId: args.providerAccountId,
  ownerUserId: task.createdBy,          // project: project.userId
  currentAccountId: task.providerAccountId,
  model: normalizedModel,
  senderUserId: ctx.userId,
  changePolicy: "owner-only",
  ownerNoun: "task owner",              // project: "project owner"
});
```

The queue drain dropped a collaborator's stored pick instead of resolving it:

```ts
// Owner-only, and a collaborator's stored override is dropped rather than
// resolved: raising here would strand the whole queue on one bad row.
requestedAccountId:
  next.userId === task.createdBy ? next.providerAccountId : undefined,
```

`retryLastTurnWithAccount` rejected every non-owner up front:

```ts
// Task chat is owner-sticky: only the owner picks the billed account
if (ctx.userId !== task.createdBy) {
  throw new Error("Only the task owner can change the provider account");
}
```

and treated `null` as an explicit Team (`args.providerAccountId === null ? undefined : ...`).

### Decision: project task chats follow the project rule

A project task chat is a `sessionChats` row with `taskId` inside the project's
session (`_sessions/owner.ts:107-119`, `ensureTaskChat` in
`ownedSession.ts:162-176`). Pre-3a, a project task used the task chat pipeline,
billed `task.createdBy`, and the task creator was the owner. Since phase 2 the
turn bills the **session** creator, which is the project owner. The change rule
must protect the person who pays, so a project task chat uses the project rule:
only `session.createdBy` (the project owner) may change it, error noun
`"project owner"`. The task creator, if a different person, is a collaborator
here. Derive the rule from `session.owner.kind` only, never from `chat.taskId`.

### Web files (owned-session chats only)

`SandboxChatPanel` renders only task and project chats; the standalone session
chat has its own panel and is out of scope.

- `apps/web/src/lib/components/chat/SandboxChatPanel.tsx:99-101`:
  `const setProviderAccountId = async (next: string | null) => { await switchProviderAccount(...) };`
  line 149: `canSwitchAccount: true,`; lines 226–231: `modelPicker={{ ..., accounts: binding.accounts, accountId: binding.providerAccountId, onAccountChange: queueGate.setAccount, ...}}`.
- `apps/web/src/lib/components/chat/sandboxChatBinding.ts:53-63` — the binding
  type (`providerAccountId`, `accounts`, `resolveAccountId`); no `isOwner` field.
- `apps/web/src/lib/components/chat/useOwnedChatBinding.ts:17-21` —
  `OwnedChatBindingCommon = Pick<SandboxChatBinding, "accounts" | "resolveAccountId" | "firstRun">`;
  line 49 reads `const { owned, session, chatSource } = ownedSession;` where
  `session` is `useQuery(api.sessions.get, ...)` (a `Doc<"sessions">`, `null` or `undefined`).
- `TaskSandboxChatPanel.tsx:49-75` and `ProjectSandboxChatPanel.tsx:39-58` call
  `useOwnedChatBinding`.
- Current user id: `useQuery(api.auth.me)` (`auth.ts:59`), imported as in
  `apps/web/src/lib/components/LiveCursors.tsx:52`.

### Rules that apply (quoted from `CLAUDE.md`)

- "No `any`, `unknown`, `as`, or non-null `!`." (This includes `as const` in tests: write literal values inline.)
- "Eliminate duplication, centralise your changes so its easier to update them" — one backend helper picks the policy; one place in the web derives `isOwner`.
- "Prefer simplicity, small diffs, co-location, explicit behavior".
- "useCallback and useMemo are banned as React Compiler is enabled".
- "Do not default to `useState`/`useRef`" — `isOwner` is derived from queries.
- From `docs/eva-convex.md`: "Never manually define interfaces for Convex documents. Always import: `Doc<"tableName">`, `Id<"fieldName">`".

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Web typecheck | `pnpm --filter @eva/web typecheck` | exit 0 |
| New tests | `pnpm --filter @eva/backend test -- tests/ownedSessionProviderAccount.test.ts` | all pass |
| Neighbour tests | `pnpm --filter @eva/backend test -- tests/quickTaskSessions.test.ts tests/projectSessions.test.ts tests/mobileApi.test.ts tests/chatQueueStuckCases.test.ts tests/messageCredentialStamp.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

Never run `npx convex codegen`, `convex dev` or `convex deploy`. Run only
targeted test files: 2 tests in `tests/sessionChatTabs.test.ts` already fail and
are not yours. The lint rule `eva/no-source-text-in-tests` bans tests that read
source text; test behaviour through `convex-test` only.

## Scope

**In scope**:

- `packages/backend/convex/_userProviderAccounts/defaults.ts`
- `packages/backend/convex/_sessions/execution.ts`
- `packages/backend/convex/_queues/helpers.ts`
- `packages/backend/convex/_sessionChats/mutations.ts`
- `packages/backend/convex/userProviderAccounts.ts` (doc comments only)
- `apps/web/src/lib/components/chat/sandboxChatBinding.ts`
- `apps/web/src/lib/components/chat/useOwnedChatBinding.ts`
- `apps/web/src/lib/components/chat/SandboxChatPanel.tsx`
- `apps/web/src/lib/components/tasks/TaskSandboxChatPanel.tsx`
- `apps/web/src/lib/components/projects/ProjectSandboxChatPanel.tsx`
- `packages/backend/tests/ownedSessionProviderAccount.test.ts` (create)
- `internal/changelog/2026-11.md`

**Out of scope**:

- `_agentTasks/updateTask.ts` and `_projects/mutations.ts` — they already enforce the rule on the task and project records.
- `_sessionChats/mutations.ts` `setModel` (lines ~150–166): it reconciles the account to the new model's provider. That is automatic, not a collaborator pick (the `defaults.ts` comment says so). Leave it.
- `listForTaskOwner` / `listForProjectOwner` / `listForSessionOwner` queries: listing masked accounts is harmless.
- The project-task picker lists the **task creator's** accounts (`useTaskOwnerProviderAccounts`) while the turn bills the **project owner**. That is a separate bug; report it, do not fix it here.
- The standalone session `ChatPanel` and any standalone-session behaviour.
- The 18 other `createdBy ?? session.userId` sites: do not refactor them.

## Git workflow

- Stay on the current branch. Do not create a branch, push, or open a PR unless the operator tells you to.
- Conventional commits, as in `git log` (e.g. `36648b6aa fix(github): stop late PR webhooks from reopening a merged PR`). Suggested: `fix(accounts): only the task or project owner switches an owned chat's account`.

## Steps

### Step 0: Confirm the product decision (STOP point)

Commit `293d6d0dd` made the opposite choice a few hours before this plan. Do
not start Step 1 until the operator confirms: "Task and project chats are
owner-only for account changes, and collaborators see the picker read-only."
If the operator wants collaborators to keep switching, mark this plan REJECTED
in `plans/README.md` with that reason and stop.

**Verify**: the operator's confirmation is in your instructions or chat.

### Step 1: Add the policy helper in `defaults.ts`

In `packages/backend/convex/_userProviderAccounts/defaults.ts`, directly below
`resolveTurnProviderAccountId`, add one helper and one guard. Import `Doc` from
`../_generated/dataModel` (the file already imports `DataModel, Id` from there).

```ts
type AccountSession = Pick<Doc<"sessions">, "owner" | "createdBy" | "userId">;

/**
 * Who may change the billed account of a chat in `session`. A standalone
 * session lets anyone with access pick from the owner's pool. A task's or
 * project's session is owner-sticky, as task and project chat were before
 * phase 3a. A project task's chat lives in the project's session and bills
 * the project owner, so the project rule applies to it.
 */
function ownedAccountRule(
  session: AccountSession,
): { ownerUserId: Id<"users">; ownerNoun: "task owner" | "project owner" } | null {
  const ownerUserId = session.createdBy ?? session.userId;
  switch (session.owner.kind) {
    case "standalone":
      return null;
    case "task":
      return { ownerUserId, ownerNoun: "task owner" };
    case "project":
      return { ownerUserId, ownerNoun: "project owner" };
  }
}

/** Throws unless `userId` may change the billed account of a chat in `session`. */
export function assertCanChangeSessionAccount(
  session: AccountSession,
  userId: Id<"users">,
): void {
  const rule = ownedAccountRule(session);
  if (rule && userId !== rule.ownerUserId) {
    throw new Error(`Only the ${rule.ownerNoun} can change the provider account`);
  }
}

/**
 * The account a session chat turn runs on. Standalone: "owner-pool"
 * (undefined = Team). Task or project: "owner-only" (undefined = keep the
 * chat's current account; a collaborator may not pick another).
 * `collaboratorPick: "ignore"` drops a collaborator's pick instead of
 * throwing — for the queue drain, where the row was valid when queued.
 */
export async function resolveSessionTurnProviderAccountId(
  db: GenericDatabaseReader<DataModel>,
  args: {
    session: AccountSession;
    currentAccountId: Id<"userProviderAccounts"> | undefined;
    requestedAccountId: Id<"userProviderAccounts"> | undefined;
    senderUserId: Id<"users">;
    model: string | undefined;
    collaboratorPick: "reject" | "ignore";
  },
): Promise<Id<"userProviderAccounts"> | undefined> {
  const ownerUserId = args.session.createdBy ?? args.session.userId;
  const rule = ownedAccountRule(args.session);
  if (!rule) {
    return await resolveTurnProviderAccountId(db, {
      requestedAccountId: args.requestedAccountId,
      ownerUserId,
      model: args.model,
      changePolicy: "owner-pool",
    });
  }
  const dropPick =
    args.collaboratorPick === "ignore" && args.senderUserId !== ownerUserId;
  return await resolveTurnProviderAccountId(db, {
    requestedAccountId: dropPick ? undefined : args.requestedAccountId,
    ownerUserId,
    currentAccountId: args.currentAccountId,
    model: args.model,
    senderUserId: args.senderUserId,
    changePolicy: "owner-only",
    ownerNoun: rule.ownerNoun,
  });
}
```

If the `switch` makes TypeScript report "not all code paths return a value",
the owner union has a new kind: STOP.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 2: Use the helper at every turn site

1. `execution.ts` `stageAndStartChatTurn` (lines 94–101): replace the
   `resolveTurnProviderAccountId` call with
   ```ts
   resolveSessionTurnProviderAccountId(ctx.db, {
     session,
     currentAccountId: chat.providerAccountId,
     requestedAccountId: settings.providerAccountId,
     senderUserId: params.actingUserId,
     model: settings.model,
     collaboratorPick: "reject",
   }),
   ```
2. `execution.ts` `enqueueChatMessage` (lines 215–220): same call, with
   `senderUserId: params.userId` and `collaboratorPick: "reject"`.
3. `_queues/helpers.ts:594-601` `turnAccountId`: change the destructure to
   `(ctx, { session, chat }, next)` and call the helper with
   `currentAccountId: chat.providerAccountId`, `requestedAccountId: next.providerAccountId`,
   `senderUserId: next.userId`, `model: next.model`, `collaboratorPick: "ignore"`.
   Replace the comment above it with:
   `// Owned sessions: a collaborator's queued pick is dropped (the chat keeps its account) rather than failing the row.`
4. Update the import lines in both files (`resolveTurnProviderAccountId` is no
   longer imported there).
5. Update the doc comment on `resolveTurnProviderAccountId` (`defaults.ts:76-82`)
   so it points at `resolveSessionTurnProviderAccountId` as the session entry point.

**Verify**: `grep -rn "resolveTurnProviderAccountId" packages/backend/convex --include=*.ts | grep -v _generated` → matches only in `_userProviderAccounts/defaults.ts`. `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 3: Gate `setProviderAccountId` and `retryLastTurnWithAccount`

1. `_sessionChats/mutations.ts` `setProviderAccountId`: after loading
   `{ chat, session }`, add
   ```ts
   if ((args.providerAccountId ?? undefined) !== chat.providerAccountId) {
     assertCanChangeSessionAccount(session, ctx.userId);
   }
   ```
   (Re-picking the current account stays a no-op for everyone.) Replace the
   doc comment's "Anyone with repo access may pick" paragraph with: "In a
   standalone session anyone with repo access may pick from the session owner's
   accounts. In a task's or project's session only its owner may change the
   pick (`assertCanChangeSessionAccount`)."
2. `execution.ts` `retryLastTurnWithAccount`: directly after the
   `hasRepoAccess` check (line 323–324), add
   `assertCanChangeSessionAccount(session, ctx.userId);`
   (pre-3a rejected every non-owner retry; standalone sessions pass).
3. Same mutation: `null` must still mean Team. Under owner-only,
   `requestedAccountId: undefined` keeps the chat's current account, which is
   the account that just hit its usage limit. So start the turn from a context
   whose chat already holds the chosen account:
   ```ts
   await stageAndStartChatTurn(ctx, {
     context: { session, chat: { ...chat, providerAccountId } },
     ...
   ```
   where `providerAccountId` is the existing `args.providerAccountId ?? undefined`
   (line 339). `stageAndStartChatTurn` patches `chat.providerAccountId` itself
   (line ~157), so the stored value matches.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.
`pnpm --filter @eva/backend test -- tests/messageCredentialStamp.test.ts tests/chatQueueStuckCases.test.ts tests/mobileApi.test.ts` → all pass.

### Step 4: Backend tests

Create `packages/backend/tests/ownedSessionProviderAccount.test.ts` (see Test
plan). Model the file on `tests/projectSessions.test.ts` (fixture, fake timers,
`TIMEOUT_MS`), and the team member on `tests/mcpSendChatMessage.test.ts:331-344`.

**Verify**: `pnpm --filter @eva/backend test -- tests/ownedSessionProviderAccount.test.ts` → all pass (8 tests).

### Step 5: Web — read-only picker for collaborators in task and project chats

1. `sandboxChatBinding.ts`: add to `SandboxChatBinding`
   ```ts
   /** Only the session owner (task creator or project owner) may change the account. */
   isOwner: boolean;
   ```
   and change the `accounts` doc comment to: "The owner's accounts: the chat
   runs on the owner's credentials whoever sends. Only the owner can switch."
2. `useOwnedChatBinding.ts`: add a parameter
   `seedOwnerUserId: Id<"users"> | undefined` with the doc
   "Who owns the session before it exists (task creator / project owner)".
   Derive, next to the other derived values:
   ```ts
   const me = useQuery(api.auth.me);
   const ownerUserId = session ? (session.createdBy ?? session.userId) : seedOwnerUserId;
   const isOwner = me !== undefined && ownerUserId !== undefined && me === ownerUserId;
   ```
   Import `useQuery` from `convex-helpers/react/cache/hooks` (as the panel
   files do) and `type Id` from `@eva/backend`. Return `isOwner` in the binding.
3. `TaskSandboxChatPanel.tsx`: pass
   `seedOwnerUserId: task?.projectId === undefined ? task?.createdBy : undefined`
   (a project task bills the project owner; before the session exists the
   picker stays read-only, which is safe).
4. `ProjectSandboxChatPanel.tsx`: pass `seedOwnerUserId: project?.userId`.
5. `SandboxChatPanel.tsx`:
   - `setProviderAccountId`: first line `if (!binding.isOwner) return;`
   - `canSwitchAccount: binding.isOwner,`
   - in `modelPicker`: `onAccountChange: binding.isOwner ? queueGate.setAccount : undefined,`

**Verify**: web typecheck command → exit 0. `grep -n "canSwitchAccount: true" apps/web/src/lib/components/chat/SandboxChatPanel.tsx` → no match.

### Step 6: Comments, changelog, lint

1. `packages/backend/convex/userProviderAccounts.ts`: the doc comments on
   `listForTaskOwner` and `listForProjectOwner` say "collaborators pick from
   the owner's accounts". Change to "collaborators see the owner's accounts;
   only the owner can switch".
2. Add at the top of `internal/changelog/2026-11.md`, under `# Changelog — November 2026`:

```
## Only the owner switches a task or project chat's account - 2026-11-12

WHY: Phase 3a moved task and project chat onto owned sessions and dropped the "owner-only" account rule, so any collaborator could move a teammate's chat between the teammate's paid accounts.

- `resolveSessionTurnProviderAccountId` picks the policy from `sessions.owner`: standalone stays owner-pool; task and project sessions are owner-only (project task chats follow the project owner, who is billed).
- `sessionChats.setProviderAccountId` and `sessionWorkflow.retryLastTurnWithAccount` reject a collaborator's change; the queue drain drops a collaborator's queued pick.
- The task and project chat picker is read-only for collaborators again (reverses the UI half of 293d6d0dd).
- Owned chats: a send without an account (MCP, mobile) now keeps the chat's account instead of falling to Team.
```

**Verify**: `pnpm lint` → exit 0. Neighbour tests command → all pass.

## Test plan

New file `packages/backend/tests/ownedSessionProviderAccount.test.ts`.

Fixture (one `t.run`): users `ownerId` (clerkId `"clerk|owner-account"`) and
`collabId` (clerkId `"clerk|collab-account"`); a `teams` row and
`teamMembers` row for `collabId`; a `githubRepos` row with
`connectedBy: ownerId, teamId`; two `userProviderAccounts` rows for `ownerId`
(`accountA`, `accountB`; `provider: "claude"`, `credentials: []`, `label`,
`createdAt`, `updatedAt` — copy the shape from
`tests/messageCredentialStamp.test.ts:50-65`, but write `provider: "claude"`
inline, not `as const`); a quick task (`createdBy: ownerId`); a project
(`userId: ownerId`, fields as `tests/projectSessions.test.ts:32-39`); a project
task with `createdBy: collabId`. Use `asOwner = t.withIdentity({ subject: ... })`
and `asCollab`. Use `vi.useFakeTimers()` in `beforeEach` as the neighbour files do.

Create chats with `asOwner.mutation(api.sessions.ensureOwned, { owner })`, then
`t.run` to `patch(chatId, { providerAccountId: accountA })`.

1. Quick-task chat: `asCollab` `api.sessionChats.setProviderAccountId` to `accountB` → rejects `/Only the task owner/`; chat still `accountA`.
2. Quick-task chat: `asCollab` sets `accountA` (no change) → resolves.
3. Quick-task chat: `asOwner` sets `accountB` → chat is `accountB`.
4. Quick-task chat: `asCollab` `api.sessionWorkflow.retryLastTurnWithAccount` with `accountB` → rejects `/Only the task owner/`.
5. Quick-task chat: `asCollab` `api.sessionWorkflow.enqueueMessage` `{ chatId, message: "hi", model: DEFAULT_AI_MODEL, providerAccountId: accountB }` → rejects `/Only the task owner/`. Then the same without `providerAccountId` → resolves, and the newest `queuedMessages` row for the chat (or, if the drain already started it, the chat) has `providerAccountId === accountA`.
6. Project main chat: `asCollab` sets `accountB` → rejects `/Only the project owner/`.
7. Project task chat (`ensureOwned({ kind: "task", taskId: projectTaskId })`): `asCollab`, who created the task, sets `accountB` → rejects `/Only the project owner/`.
8. Standalone session (insert `sessions` with `owner: { kind: "standalone" }`, `userId: ownerId`, `createdBy: ownerId`, and a Main `sessionChats` row, as `tests/messageCredentialStamp.test.ts:35-49`): `asCollab` sets `accountB` → resolves (unchanged behaviour).

Verification: `pnpm --filter @eva/backend test -- tests/ownedSessionProviderAccount.test.ts` → 8 pass.

## Done criteria

- [ ] Step 0 confirmation recorded
- [ ] `pnpm --filter @eva/backend typecheck` and the web typecheck exit 0
- [ ] `pnpm --filter @eva/backend test -- tests/ownedSessionProviderAccount.test.ts` passes 8 tests
- [ ] Neighbour tests command passes
- [ ] `grep -rn '"owner-pool"' packages/backend/convex --include=*.ts | grep -v _generated` → matches only in `_userProviderAccounts/defaults.ts`
- [ ] `grep -rn "assertCanChangeSessionAccount(" packages/backend/convex --include=*.ts` → 3 matches (definition + 2 uses)
- [ ] `pnpm lint` exits 0; `git status --short` lists only in-scope files (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 0: no operator confirmation.
- An excerpt above does not match the live code.
- `sessions.owner` has a kind other than standalone/task/project.
- Another public mutation writes `sessionChats.providerAccountId` or passes a caller-chosen account into a turn and is not listed here (check `grep -rn "providerAccountId" packages/backend/convex --include=*.ts | grep -v _generated | grep -i "chat"`). Report it.
- Test 5's drain starts a workflow that `convex-test` cannot run and the test cannot be made stable by asserting only the rejection — report rather than stubbing internals.
- The web picker still lets a collaborator open account submenus with `onAccountChange` undefined (check `ModelPicker` in `@vvedantb/ui`). Report; do not edit the UI package.

## Maintenance notes

- New entry points that send into a session chat with a caller-chosen account must use `resolveSessionTurnProviderAccountId`, never `resolveTurnProviderAccountId` directly.
- Behaviour change for owned chats: a send with no account now keeps the chat's account (was Team). MCP sends (`mcp/orchestratorDelivery.ts:160-185`) omit the account, so they no longer flip a task chat to Team.
- Reviewer: check the retry path still honours `null` = Team for the owner (Step 3.3), and that standalone sessions are unchanged.
- Deferred: the project-task picker lists the task creator's accounts but the turn bills the project owner. A follow-up should list `listForSessionOwner` (session creator) for every owned chat.
- `293d6d0dd` wrote its entry to the legacy `internal/changelog.md`, not the monthly file.
