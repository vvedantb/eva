# Plan 020: A task's or project's session obeys its owner's access rule

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (add the row if it is missing) — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 478be7912..HEAD -- packages/backend/convex/functions.ts packages/backend/convex/_sessions/queries.ts packages/backend/convex/_sessions/execution.ts packages/backend/convex/_sessions/mutations.ts packages/backend/convex/_sessions/proposedPlans.ts packages/backend/convex/_sessions/repos.ts packages/backend/convex/_sessions/workflow.ts packages/backend/convex/_sessionChats/helpers.ts packages/backend/convex/_sessionChats/queries.ts packages/backend/convex/_chatSource/helpers.ts packages/backend/convex/_sandbox/owner.ts packages/backend/convex/_pullRequests/functions.ts packages/backend/convex/backgroundProcesses.ts packages/backend/convex/docs.ts packages/backend/convex/turns.ts packages/backend/convex/sandboxWake.ts packages/backend/convex/streaming.ts packages/backend/convex/userProviderAccounts.ts packages/backend/convex/queuedMessages.ts packages/backend/convex/mobile.ts packages/backend/convex/mcp/queries.ts packages/backend/convex/mcp/agentInteractionQueries.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts and the site table against the live code before
> proceeding; on a mismatch, treat it as a STOP condition. Expected overlap:
> plan 019 edits `_sessions/execution.ts` (`retryLastTurnWithAccount`) and
> `_sessionChats/mutations.ts`; plan 021 edits the maintenance gate in
> `functions.ts` (~lines 522–561). If they landed first, only re-check the
> lines this plan names.

## Status

- **Priority**: P1
- **Effort**: M (about 40 one-line call-site swaps behind 1 new helper set; each swap is mechanical)
- **Risk**: MED (changes the access rule at many read sites; sandbox callbacks are deliberately left alone)
- **Depends on**: none (soft overlap with 019 and 021, see drift check)
- **Category**: security
- **Planned at**: commit `478be7912`, 2026-11-12

## Why this matters

Quick tasks and projects now run on hidden "owned sessions" (`sessions.owner`
is `task` or `project`). The owner itself is protected by the task rule: a
`draft` task is visible only to its creator. But almost every session and
session-chat reader still checks only "can this user reach the repo". A
teammate who has a draft task's session id — or who simply guesses its
per-repo session number, because owned sessions take numbers from the same
sequence as normal sessions — can read the draft's session, its chats,
transcript status, plan and PRs, and can act on it (send, cancel, edit the
plan). The same gap exists over MCP. After this plan, one central rule decides
session access from the owner: standalone → repo; task → the task rule;
project → the project rule. A project task's own chat follows its task's rule.

## Current state

### The access helpers (`packages/backend/convex/functions.ts`)

`functions.ts` already imports from `./_sessions/owner` (line ~30:
`import { findProjectSession, isTerminalProjectPhase } from "./_sessions/owner";`),
and `_sessions/owner.ts` imports nothing from `functions.ts`, so adding imports
from it is cycle-free.

`functions.ts:154-177` — the task rule:

```ts
/** A `draft` task is private to its creator; every other status is shared. */
export function isTaskVisibleTo(
  task: Pick<Doc<"agentTasks">, "status" | "createdBy">,
  userId: Id<"users">,
): boolean {
  return task.status !== "draft" || task.createdBy === userId;
}

/** Checks if a user can access a task: draft privacy, then its parent repo or project. */
export async function hasTaskAccess(
  db: GenericDatabaseReader<DataModel>,
  task: Pick<Doc<"agentTasks">, "repoId" | "projectId" | "status" | "createdBy">,
  userId: Id<"users">,
): Promise<boolean> {
```

`functions.ts:194-205` — the session helper checks only the repo:

```ts
/** Loads a session and verifies access through its repository. */
export async function getSessionWithAccess(
  db: GenericDatabaseReader<DataModel>,
  sessionId: Id<"sessions">,
  userId: Id<"users">,
): Promise<Doc<"sessions">> {
  const session = await db.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (!(await hasRepoAccess(db, session.repoId, userId))) {
    throw new Error("Not authorized");
  }
  return session;
}
```

`functions.ts:208-245` — `assertMessageParentAccess`: for a `sessionChats` id
it calls `getSessionWithAccess(db, chat.sessionId, userId)`; for a `sessions`
id it calls `getSessionWithAccess(db, sessionId, userId)`; tasks use
`hasTaskAccess`; projects use `getProjectWithAccess`.

### The owner model (`packages/backend/convex/_sessions/owner.ts`)

```ts
export const sessionOwnerValidator = v.union(
  v.object({ kind: v.literal("standalone") }),
  v.object({ kind: v.literal("task"), taskId: v.id("agentTasks") }),
  v.object({ kind: v.literal("project"), projectId: v.id("projects") }),
);
export type SessionOwner = Infer<typeof sessionOwnerValidator>;
...
export function sessionOwner(session: OwnerFields): SessionOwner {
export function isStandaloneSession(session: OwnerFields): boolean {
```

`_sessions/owner.ts:238-240`:

```ts
export type OwnerEntity =
  | { kind: "task"; task: Doc<"agentTasks"> }
  | { kind: "project"; project: Doc<"projects"> };
```

`_sessions/owner.ts` (`chatOwner`, ~line 248) — the existing rule for "who a
chat speaks for":

```ts
/**
 * Who one chat speaks for: a project task's own chat (`sessionChats.taskId`)
 * for that task, any other chat for its session's owner. ...
 */
export function chatOwner(
  chat: Pick<Doc<"sessionChats">, "taskId">,
  session: OwnerFields,
): SessionOwner {
  return chat.taskId !== undefined
    ? { kind: "task", taskId: chat.taskId }
    : sessionOwner(session);
}
```

### The owner rule that already exists (`_sessions/queries.ts:484-500`)

```ts
export async function loadOwnerEntityWithAccess(
  db: DatabaseReader,
  owner: OwnedSessionOwner,
  userId: Id<"users">,
): Promise<OwnerEntity | null> {
  const entity = await loadOwnerEntity(db, owner);
  if (!entity) return null;
  const allowed =
    entity.kind === "task"
      ? await hasTaskAccess(db, entity.task, userId)
      : await hasRepoAccess(db, entity.project.repoId, userId);
  return allowed ? entity : null;
}
```

`getOwned` and `ensureOwned` use it. So "project access" in this codebase is
`hasRepoAccess(project.repoId)` (also see `getProjectWithAccess`); only the
task rule adds draft privacy. A draft task CAN have a session: its creator
passes `ensureOwned` (`_sessions/mutations.ts:465-478`), and drafts may carry a
`projectId` (`_agentTasks/drafts.ts:115-126`), so a draft project task can own
a chat (`sessionChats.taskId`) inside its project's session.

### Readers that check only the repo

`_sessions/queries.ts:473-482` (`get`):

```ts
    const session = await ctx.db.get(args.id);
    if (!session) return null;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) return null;
    return entityVisible(session);
```

`_sessions/queries.ts:541-558` (`getByNumId`) — repo check, then any session
with that number, owned or not:

```ts
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) return null;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_repo_and_numId", (q) =>
        q.eq("repoId", args.repoId).eq("numId", args.numId),
      )
      .first();
    return entityVisible(session);
```

Owned sessions take a number from the same sequence
(`_sessions/ownedSession.ts:109-131`: "It takes a normal session `numId`; the
visible session numbers may skip it." … `numId: await allocateNumId(ctx.db, seed.repoId, "sessions")`).

`_sessionChats/helpers.ts:52-63` (`getSessionChatWithAccess`, used by
`_sessionChats/mutations.ts` ×4 and `_sessions/mutations.ts:340`):

```ts
  const context = await getSessionChatOrThrow(db, chatId);
  if (!(await hasRepoAccess(db, context.session.repoId, userId))) {
    throw new Error("Not authorized");
  }
```

`turns.ts:109-122` (`readLegacyExecuting`): `hasRepoAccess(ctx.db, chat.repoId, userId)`
for a chat and `hasRepoAccess(ctx.db, session.repoId, userId)` for a session.

MCP — `mcp/queries.ts:137-146` (`findById`) and `:202-209` (`findByNumId`)
return any session as `{ kind: "session", doc }`; the only check is
`mcp/queries.ts:321`:

```ts
    const repoId = await targetRepoId(ctx, hit);
    if (!repoId) return null;
    if (!(await hasRepoAccess(ctx.db, repoId, userId))) return null;
```

(The same line also lets a teammate resolve a *draft task* by id or number —
`kind: "task"` hits get only the repo check. This plan fixes that too, since it
is the same line.)

### How the web routes owned sessions (decides `getByNumId` and MCP numId)

- The `/sessions/$numId` route resolves through `api.sessions.getByNumId`
  (`apps/web/src/lib/useResolveByNumId.ts:49-59`,
  `apps/web/src/routes/_repo/$owner/$repo/sessions/_utils/prefetchSession.ts:31-32`).
- A task's or project's session is opened by id, never by number:
  `apps/web/src/lib/components/sandbox/useOwnedSession.ts:45-51` calls
  `api.sessions.getOwned`, then `api.sessions.get({ id: owned.sessionId })`.
- Links to an owned session's content go to the owner's route:
  `apps/web/src/lib/components/sandbox/chatSource.ts:47-56` maps `kind: "task"`
  to `/quick-tasks/$numId/sandbox/...` and `kind: "project"` to
  `/projects/$numId/sandbox/...`; the backend remaps an owned session source
  to its owner (`_chatSource/helpers.ts:153-156`). Mentions and search use
  `standaloneOnly` (`_sessions/owner.ts`), and the Sessions list reads
  standalone rows only.
- MCP: a sandbox's MCP token names its *session* (`_sandbox_runtime/helpers.ts:826-836`:
  `entityId: launchSession ? String(launchSession._id) : entityId` with
  `entityKind: "session"`), and `withSelfDefault` (`mcp/entityRef.ts:181-190`)
  turns "no ref" into `{ id: <that session id>, kind: "session" }`. So the agent
  inside a quick task's or project's sandbox resolves its own owned session
  **by id**. That path must keep working.

**Decision**: `sessions.getByNumId` and MCP `findByNumId` (kind `session`)
return null for non-standalone sessions (an owned session number is not a
user-facing address). `sessions.get` and MCP `findById` keep resolving owned
sessions, but under the owner-aware rule.

### Conventions (quoted from `CLAUDE.md` / `docs/eva-convex.md`)

- "No `any`, `unknown`, `as`, or non-null `!`."
- "Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions."
- "Eliminate duplication, centralise your changes so its easier to update them" — one rule in `functions.ts`; every site calls it.
- "Always import: `Doc<"tableName">`, `Id<"fieldName">` … Never duplicate schema types manually."
- Lint rule `eva/no-source-text-in-tests`: tests must exercise behaviour, never read source text.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| New tests | `pnpm --filter @eva/backend test -- tests/ownedSessionAccess.test.ts` | all pass |
| Owned-session regression | `pnpm --filter @eva/backend test -- tests/quickTaskSessions.test.ts tests/projectSessions.test.ts` | all pass |
| MCP / chat regression | `pnpm --filter @eva/backend test -- tests/mcpEntityTools.test.ts tests/mcpSendChatMessage.test.ts tests/artifactSource.test.ts tests/mobileApi.test.ts tests/attachMediaSessionChat.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

NEVER run `npx convex codegen`, `convex dev` or `convex deploy` (no new public
functions are added, so codegen is not needed). Two tests in
`tests/sessionChatTabs.test.ts` already fail and are not yours: run only the
targeted files above.

## Scope

**In scope** (the only files you should modify):

- `packages/backend/convex/functions.ts`
- `packages/backend/convex/_sessions/queries.ts`
- `packages/backend/convex/_sessions/execution.ts`
- `packages/backend/convex/_sessions/mutations.ts`
- `packages/backend/convex/_sessions/proposedPlans.ts`
- `packages/backend/convex/_sessions/repos.ts`
- `packages/backend/convex/_sessions/workflow.ts` (only `requestStopBackgroundAgent`)
- `packages/backend/convex/_sessionChats/helpers.ts`
- `packages/backend/convex/_sessionChats/queries.ts`
- `packages/backend/convex/_chatSource/helpers.ts`
- `packages/backend/convex/_sandbox/owner.ts`
- `packages/backend/convex/_pullRequests/functions.ts`
- `packages/backend/convex/backgroundProcesses.ts` (only `listRunning`)
- `packages/backend/convex/docs.ts`
- `packages/backend/convex/turns.ts`
- `packages/backend/convex/sandboxWake.ts`
- `packages/backend/convex/streaming.ts`
- `packages/backend/convex/userProviderAccounts.ts`
- `packages/backend/convex/queuedMessages.ts`
- `packages/backend/convex/mobile.ts`
- `packages/backend/convex/mcp/queries.ts`
- `packages/backend/convex/mcp/agentInteractionQueries.ts`
- `packages/backend/tests/ownedSessionAccess.test.ts` (create)
- `internal/changelog/2026-11.md`

**Out of scope** (do NOT touch):

- Sandbox daemon callbacks (rows marked "Leave — daemon" in the table):
  `_sessions/workflow.ts` `claimPendingTurn`, `updateBackgroundAgents`,
  `updateGoal`, `openSyntheticTurn`, `completeSyntheticTurn`,
  `handleCompletion`; `backgroundProcesses.ts` `register`,
  `markExitedByShellId`; `_sessions/execution.ts` `getDaemonPrewarmData`;
  `sandboxGit.ts` `reportBranch`. They run with the launching user's sandbox
  token on a 50 ms poll or at turn end. Changing their rule can strand turns
  and is the subject of plan 009 (callback authorisation).
- Who may change a chat's provider account — plan 019.
- Maintenance gating — plan 021.
- Any web (`apps/web`) or mobile (`apps/mobile`) change. No client change is
  needed: owned sessions are already opened by id or through the owner route.
- `legacyIds.resolveNumId` — it returns only a number; the follow-up read
  (`getByNumId`) is what this plan closes.
- `chatLog.ts`, `mcp/chatSelfQueries.ts`, `mcp/queries.ts` `getChatDetails` /
  `entityIsExecuting` / `sessionLinkedRepos` — internal, called only after
  `resolveChatTargetForUser` has checked access.

## Git workflow

- Stay on the current branch. Do not create a branch, push, or open a PR unless the operator says so.
- Conventional commits, as in `git log` (e.g. `fix(github): stop late PR webhooks from reopening a merged PR`).
- Suggested: one commit per step, e.g. `fix(sessions): owner-aware session access helpers`,
  `fix(sessions): route session readers through the owner rule`,
  `fix(mcp): owner-aware chat target access`, `test(sessions): draft task session privacy`.

## Steps

### Step 1: Add the owner-aware rule to `functions.ts`

In `packages/backend/convex/functions.ts`:

1. Extend the existing `./_sessions/owner` import with
   `chatOwner, sessionOwner, type OwnerEntity, type SessionOwner`.
2. Directly below `getTaskWithAccess` (before `getSessionWithAccess`), add:

```ts
/** The access rule of the task or project behind an owned session. */
export async function hasOwnerEntityAccess(
  db: GenericDatabaseReader<DataModel>,
  entity: OwnerEntity,
  userId: Id<"users">,
): Promise<boolean> {
  return entity.kind === "task"
    ? await hasTaskAccess(db, entity.task, userId)
    : await hasRepoAccess(db, entity.project.repoId, userId);
}

/**
 * Who may reach what a session owner speaks for: the repo for a standalone
 * session; the task's rule (a draft is private to its creator) or the
 * project's for an owned one. A missing owner row denies.
 */
async function hasSessionOwnerAccess(
  db: GenericDatabaseReader<DataModel>,
  owner: SessionOwner,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
): Promise<boolean> {
  if (owner.kind === "standalone") return await hasRepoAccess(db, repoId, userId);
  if (owner.kind === "task") {
    const task = await db.get(owner.taskId);
    return task !== null && (await hasOwnerEntityAccess(db, { kind: "task", task }, userId));
  }
  const project = await db.get(owner.projectId);
  return project !== null && (await hasOwnerEntityAccess(db, { kind: "project", project }, userId));
}

/** Whether a user may reach a session, by its owner's rule. */
export async function hasSessionAccess(
  db: GenericDatabaseReader<DataModel>,
  session: Pick<Doc<"sessions">, "owner" | "repoId">,
  userId: Id<"users">,
): Promise<boolean> {
  return await hasSessionOwnerAccess(db, sessionOwner(session), session.repoId, userId);
}

/**
 * Whether a user may reach one chat of a session. A project task's own chat
 * (`sessionChats.taskId`) follows its task's rule (`chatOwner`).
 */
export async function hasSessionChatAccess(
  db: GenericDatabaseReader<DataModel>,
  chat: Pick<Doc<"sessionChats">, "taskId">,
  session: Pick<Doc<"sessions">, "owner" | "repoId">,
  userId: Id<"users">,
): Promise<boolean> {
  return await hasSessionOwnerAccess(db, chatOwner(chat, session), session.repoId, userId);
}

/** `hasSessionChatAccess` / `hasSessionAccess` for a chat-or-session id. */
export async function hasChatParentAccess(
  db: GenericDatabaseReader<DataModel>,
  parentId: Id<"sessionChats"> | Id<"sessions">,
  userId: Id<"users">,
): Promise<boolean> {
  const chatId = db.normalizeId("sessionChats", parentId);
  if (chatId) {
    const chat = await db.get(chatId);
    const session = chat ? await db.get(chat.sessionId) : null;
    return chat !== null && session !== null && (await hasSessionChatAccess(db, chat, session, userId));
  }
  const sessionId = db.normalizeId("sessions", parentId);
  const session = sessionId ? await db.get(sessionId) : null;
  return session !== null && (await hasSessionAccess(db, session, userId));
}

/** A chat an MCP caller named: the read rule of its surface. */
export async function hasChatTargetAccess(
  db: GenericDatabaseReader<DataModel>,
  hit:
    | { kind: "session"; doc: Doc<"sessions"> }
    | { kind: "task"; doc: Doc<"agentTasks"> }
    | { kind: "project"; doc: Doc<"projects"> },
  userId: Id<"users">,
): Promise<boolean> {
  if (hit.kind === "session") return await hasSessionAccess(db, hit.doc, userId);
  if (hit.kind === "task") return await hasTaskAccess(db, hit.doc, userId);
  return await hasRepoAccess(db, hit.doc.repoId, userId);
}
```

3. In `getSessionWithAccess`, replace
   `hasRepoAccess(db, session.repoId, userId)` with
   `hasSessionAccess(db, session, userId)` and update its doc comment to
   "Loads a session and verifies access by its owner's rule."
4. In `assertMessageParentAccess`, the `sessionChats` branch: keep
   `if (!chat) throw new Error("Chat not found");`, then replace
   `await getSessionWithAccess(db, chat.sessionId, userId); return;` with
   `if (!(await hasChatParentAccess(db, chatId, userId))) throw new Error("Not authorized"); return;`.
   Leave the other branches as they are.

Format the new code with the repo's prettier style (wrap lines >80 chars as
the surrounding code does) — do not run a formatter over other files.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 2: Use the shared rule in `loadOwnerEntityWithAccess`

In `_sessions/queries.ts:484-500`, replace the inline `allowed` ternary with
`const allowed = await hasOwnerEntityAccess(db, entity, userId);` (import it
from `../functions`). Remove `hasTaskAccess` from that file's imports only if
nothing else in the file uses it.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0;
`grep -n "hasTaskAccess(db, entity.task" packages/backend/convex/_sessions/queries.ts` → no match.

### Step 3: Route every session reader through the rule

Work through this table top to bottom. "Session" means replace
`hasRepoAccess(<db>, session.repoId, <userId>)` with
`hasSessionAccess(<db>, session, <userId>)` (keep the same `db`/`userId`
expressions and the same failure behaviour: `return null`, `return []`,
`return false` or `throw`). "Chat" means use
`hasSessionChatAccess(<db>, chat, session, <userId>)` when both docs are in
hand, else `hasChatParentAccess(<db>, chat._id, <userId>)`. Update imports
(add the new helper; drop `hasRepoAccess` from an import only if no use is
left in that file). Line numbers are at `478be7912`.

| # | File:line | Function | Today | Action |
|---|---|---|---|---|
| 1 | `functions.ts:201` | `getSessionWithAccess` | session repo | Done in Step 1 (covers its ~30 callers in `_sessions/*`, `_sessionChats/mutations.ts`, `_drafts`, `docs.ts`, `mobile.ts`, `orchestratorWatch.ts`) |
| 2 | `_sessionChats/helpers.ts:59` | `getSessionChatWithAccess` | `context.session.repoId` | Chat: `hasSessionChatAccess(db, context.chat, context.session, userId)` |
| 3 | `_sessions/queries.ts:335` | `getFirstMessagePreview` | session repo | Session |
| 4 | `_sessions/queries.ts:358` | `toForkLink` | `visible.repoId` | Session (`hasSessionAccess(db, visible, userId)`) |
| 5 | `_sessions/queries.ts:389` | `getForkLinks` | session repo | Session |
| 6 | `_sessions/queries.ts:431` | `listGroup` | session repo | Session |
| 7 | `_sessions/queries.ts:479` | `get` | session repo | Session |
| 8 | `_sessions/queries.ts:549` | `getByNumId` | `args.repoId` only | Keep the repo check; then return null unless the row is standalone — Step 4 |
| 9 | `_sessions/execution.ts:323` | `retryLastTurnWithAccount` | session repo | Session (plan 019 may also edit this function; keep both changes) |
| 10 | `_sessions/execution.ts:395` | `startExecute` | session repo | Session |
| 11 | `_sessions/execution.ts:490` | `prewarmDaemon` | session repo | Session |
| 12 | `_sessions/execution.ts:626` | `enqueueMessage` | `context.session.repoId` | Chat: `hasSessionChatAccess(ctx.db, context.chat, context.session, ctx.userId)` |
| 13 | `_sessions/execution.ts:735` | `cancelExecution` | `context.session.repoId` | Chat, as #12 |
| 14 | `_sessions/execution.ts:749` | `cancelSessionExecution` | session repo | Session |
| 15 | `_sessions/mutations.ts:110` | `joinSessionGroup` | `source.repoId` | Session (`hasSessionAccess(ctx.db, source, ctx.userId)`) |
| 16 | `_sessions/proposedPlans.ts:17` | `listBySession` | session repo | Session |
| 17 | `_sessions/proposedPlans.ts:36` | `markImplemented` | session repo | Session |
| 18 | `_sessions/repos.ts:58` | `listRepos` | session repo | Session |
| 19 | `_sessions/workflow.ts:1238` | `requestStopBackgroundAgent` (user-facing) | `chat.repoId` | Chat: `hasChatParentAccess(ctx.db, chat._id, ctx.userId)` |
| 20 | `_sessionChats/queries.ts:21` | `listForSession` | session repo | Session; then also drop chats the user cannot reach: `const visible = []; for (const chat of chats) if (await hasSessionChatAccess(ctx.db, chat, session, ctx.userId)) visible.push(chat);` and sort `visible` (hides a draft project task's chat in a shared project session) |
| 21 | `_sessionChats/queries.ts:33` | `get` | `chat.repoId` | Chat: `hasChatParentAccess(ctx.db, chat._id, ctx.userId)` |
| 22 | `_sessionChats/queries.ts:52` | `resolveForSession` | session repo | Session |
| 23 | `_sessionChats/queries.ts:120` | `resolveDeliveryChat` | session repo | Session |
| 24 | `_chatSource/helpers.ts:150` | `chatSourceFieldsFromArg` | session repo | Session |
| 25 | `_chatSource/helpers.ts:185` | `callerCanSeeChatSource` | session repo | Session |
| 26 | `_sandbox/owner.ts:73` | `resolveSandboxOwnerForUser` (panes, PTYs, streams) | session repo | Session |
| 27 | `_pullRequests/functions.ts:63` | `canReadOwner` | session repo | Session |
| 28 | `backgroundProcesses.ts:45` | `listRunning` (query) | session repo | Session |
| 29 | `docs.ts:419` | `getBySession` | session repo | Session |
| 30 | `turns.ts:111` | `readLegacyExecuting` | `chat.repoId` | Chat: `hasChatParentAccess(ctx.db, chatId, userId)` |
| 31 | `turns.ts:119` | `readLegacyExecuting` | session repo | Session |
| 32 | `turns.ts:172` | `listSessionChatStatuses` | session repo | Session |
| 33 | `sandboxWake.ts:100` | `getWakeTarget` | session repo | Session |
| 34 | `streaming.ts:207` | `canReadStream` (`sessionChat`) | `chat.repoId` | Chat: `hasChatParentAccess(db, chat._id, userId)` |
| 35 | `userProviderAccounts.ts:107` | `listForSessionOwner` | session repo | Session |
| 36 | `queuedMessages.ts:42,69,104,132,164,201` | `listByParent` and the 5 mutations | `parent.repoId` | Replace each `hasRepoAccess(ctx.db, parent.repoId, ctx.userId)` with `hasChatParentAccess(ctx.db, <the parent id used to load parent>, ctx.userId)`. Keep the `!parent` existence check and every later use of `parent` |
| 37 | `mobile.ts:52,61` | `getChat`, `resolveWritableChat` | `resolved.repoId` | Add a local `canReachMobileEntity(db, entity, userId)`: `session` → `hasSessionChatAccess(db, entity.context.chat, entity.context.session, userId)`; `task` → `hasTaskAccess(db, entity.task, userId)`; `project` → `hasRepoAccess(db, entity.project.repoId, userId)`. Use it with `resolved.entity` at both sites (`MobileChatEntity`, `_mobile/chatTarget.ts:124-127`) |
| 38 | `mcp/queries.ts:321` | `resolveChatTargetForUser` | `targetRepoId` → repo | Step 5 |
| 39 | `mcp/agentInteractionQueries.ts:149` | pending-question listing | `chatRepoId` → repo | Replace `hasRepoAccess(ctx.db, repoId, userId)` in the `Promise.all` with `hasChatTargetAccess(ctx.db, hit, userId)` (keep the `repoId` lookup; it is still used for `repo`) |
| — | `_sessions/workflow.ts:1066,1188,1220,1432,1490,1632` | `claimPendingTurn`, `updateBackgroundAgents`, `updateGoal`, `openSyntheticTurn`, `completeSyntheticTurn`, `handleCompletion` | chat/session repo | **Leave — daemon** (see Out of scope) |
| — | `backgroundProcesses.ts:91,131` | `register`, `markExitedByShellId` | session repo | **Leave — daemon** |
| — | `_sessions/execution.ts:576` | `getDaemonPrewarmData` (internal) | session repo | **Leave — daemon** |
| — | `sandboxGit.ts:96` | `reportBranch` | `owner.repoId` (a session doc) | **Leave — daemon** (branch watcher) |
| — | `_sessions/queries.ts:498` | `loadOwnerEntityWithAccess` | project repo | Done in Step 2 |
| — | `_chatSource/helpers.ts:171,194`, `_pullRequests` project branch | project repo | **Leave** — already the project rule |

Then run this sweep; every remaining hit must be a "Leave" row above:

```
grep -rnE "hasRepoAccess\([^)]*(session|chat|context\.session|source|visible|parent|resolved)\.repoId" packages/backend/convex --include=*.ts | grep -v _generated
```

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0. The sweep prints
exactly these lines (numbers may shift by a few): `_sessions/workflow.ts`
×6 (1066, 1188, 1220, 1432, 1490, 1632), `backgroundProcesses.ts` ×2 (91, 131),
`_sessions/execution.ts` ×1 (576). `sandboxGit.ts:96` uses `owner.repoId` and
does not match.

### Step 4: `getByNumId` resolves standalone sessions only

In `_sessions/queries.ts` `getByNumId`, after the `.first()`:

```ts
    // A task's or project's session takes a number from the same sequence but
    // is opened through its owner (quick-task / project routes), never by
    // number: a number must not reach a session the owner rule hides.
    if (!session || !isStandaloneSession(session)) return null;
    return entityVisible(session);
```

`isStandaloneSession` is already imported in this file (used at line ~467).
Update the doc comment: "Resolves a standalone session by per-repo numeric id (URL segment)."

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 5: MCP resolves chats by the owner rule

In `mcp/queries.ts`:

1. `findByNumId`, `kind === "session"` branch: return
   `doc && isStandaloneSession(doc) ? { kind, doc } : null;` (import
   `isStandaloneSession` from `../_sessions/owner`). Add a one-line comment:
   "Owned sessions are reached through their task or project number."
2. `findById`: no change — a sandbox's own MCP token resolves its owned
   session by id (`withSelfDefault`).
3. `resolveChatTargetForUser` (line ~321): replace
   `if (!(await hasRepoAccess(ctx.db, repoId, userId))) return null;` with
   `if (!(await hasChatTargetAccess(ctx.db, hit, userId))) return null;`
   (import from `../functions`). Keep the `targetRepoId` lookup and the
   `if (!repoId) return null;` line; `repoId` is still used below.
4. Update the doc comment above `resolveChatTargetForUser`: "…AND for 'exists
   but this user cannot reach it' (the repo, a draft task's creator rule, or an
   owned session's owner rule)…".

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0;
`pnpm --filter @eva/backend test -- tests/mcpEntityTools.test.ts tests/mcpSendChatMessage.test.ts` → all pass.

### Step 6: Tests

Create `packages/backend/tests/ownedSessionAccess.test.ts` (cases in the Test
plan below).

**Verify**: `pnpm --filter @eva/backend test -- tests/ownedSessionAccess.test.ts` → all pass (9 tests).

### Step 7: Regression, changelog, lint

Add at the top of `internal/changelog/2026-11.md`, directly under
`# Changelog — November 2026`:

```
## Owned sessions follow their task's or project's access rule - 2026-11-12

WHY: A draft quick task is private to its creator, but its session, chats and number were readable (and actionable) by any repo collaborator, in the web API and over MCP.

- `hasSessionAccess` / `hasSessionChatAccess` / `hasChatParentAccess` in `functions.ts`: standalone → repo; task → `hasTaskAccess`; project → project repo. A project task's chat follows its task. Session and chat readers, `getSessionWithAccess` and `getSessionChatWithAccess` use them.
- `sessions.getByNumId` and MCP numId lookups return standalone sessions only; owned sessions open through their owner.
- MCP chat targets use the owner rule (also closes draft-task lookup by id or number). Sandbox daemon callbacks are unchanged.
```

**Verify**:
`pnpm --filter @eva/backend test -- tests/quickTaskSessions.test.ts tests/projectSessions.test.ts tests/artifactSource.test.ts tests/mobileApi.test.ts tests/attachMediaSessionChat.test.ts` → all pass.
`pnpm lint` → exit 0.

## Test plan

New file `packages/backend/tests/ownedSessionAccess.test.ts`. Model the
structure on `tests/quickTaskSessions.test.ts` (`convexTest(schema, modules)`,
`import.meta.glob("../convex/**/*.ts")`, fake timers in `beforeEach`) and the
two-user fixture on `tests/artifactSource.test.ts:18-45` (`teams` +
`teamMembers` rows, `t.withIdentity({ subject: ... })`).

Fixture (all rows inserted with `t.run`, no mutations needed):

- users `creator` (`clerkId: "clerk|owned-access-creator"`) and `teammate`
  (`"clerk|owned-access-teammate"`); one `teams` row; both in `teamMembers`
  (`role: "member"`).
- `githubRepos` row with `teamId` set to that team (so the teammate has repo access) and `connectedBy: creator`.
- draft quick task: `agentTasks` `{ repoId, title, status: "draft", numId: 1, createdAt, updatedAt, createdBy: creator }`.
- its session: `sessions` `{ owner: { kind: "task", taskId }, repoId, userId: creator, title, status: "closed", numId: 5 }` and a Main `sessionChats` `{ sessionId, repoId, userId: creator, title: "Main", number: 1, isMain: true }`.
- a project `{ repoId, userId: creator, title, rawInput, phase: "in_progress", numId: 1 }`, its session `{ owner: { kind: "project", projectId }, ..., numId: 6 }` with a Main chat, plus a draft project task `{ ..., projectId, status: "draft", numId: 2, createdBy: creator }` and its chat in the project session `{ ..., taskId: draftProjectTaskId, title: "Task", number: 2, isMain: false }`.
- a standalone session `{ owner: { kind: "standalone" }, ..., numId: 7 }`.

Cases:

1. Teammate: `api.sessions.get({ id: draftTaskSessionId })` → `null`.
2. Teammate: `api.sessionChats.get({ chatId: draftTaskMainChatId })` → `null`; `api.sessionChats.listForSession({ sessionId: draftTaskSessionId })` → `[]`.
3. Teammate: `api.sessions.updatePlanContent({ id: draftTaskSessionId, planContent: "x" })` rejects with `"Not authorized"`.
4. Creator: case 1 returns the session; case 3 resolves.
5. `api.sessions.getByNumId({ repoId, numId: 5 })` → `null` for BOTH users (owned session); `numId: 7` → the standalone session for the teammate.
6. Project session: teammate `api.sessions.get({ id: projectSessionId })` returns it; `api.sessionChats.listForSession({ sessionId: projectSessionId })` returns the Main chat but not the draft project task's chat; the creator's list returns both.
7. Teammate: `api.sessionChats.get({ chatId: draftProjectTaskChatId })` → `null`; creator → the chat.
8. MCP: `t.query(internal.mcp.queries.resolveChatTargetForUser, { userId: teammate, kind: "session", id: draftTaskSessionId })` → `null`; same with `userId: creator` → non-null with `kind: "session"`. (Shape: `tests/mcpEntityTools.test.ts:486-494`.)
9. MCP: `resolveChatTargetForUser({ userId: creator, kind: "session", numId: 5, repoId })` → `null`; `numId: 7` → the standalone session.

Run: `pnpm --filter @eva/backend test -- tests/ownedSessionAccess.test.ts` → 9 pass.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `tests/ownedSessionAccess.test.ts` exists; its 9 tests pass
- [ ] `tests/quickTaskSessions.test.ts`, `tests/projectSessions.test.ts`, `tests/mcpEntityTools.test.ts`, `tests/mcpSendChatMessage.test.ts`, `tests/artifactSource.test.ts`, `tests/mobileApi.test.ts`, `tests/attachMediaSessionChat.test.ts` pass
- [ ] The Step 3 sweep grep prints only the 9 "Leave — daemon" lines
- [ ] `grep -n "hasRepoAccess(db, session.repoId" packages/backend/convex/functions.ts` → no match
- [ ] `grep -n "isStandaloneSession(session)" packages/backend/convex/_sessions/queries.ts` shows the `getByNumId` guard
- [ ] `pnpm lint` exits 0; `git status --short` lists only in-scope files
- [ ] `internal/changelog/2026-11.md` has the new entry at the top
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A site in the table does not match the "Today" column, or the sweep finds a
  session/chat repo check that is not in the table (report file:line; do not
  guess whether it is daemon or user-facing).
- Any existing test in the regression list fails after Step 3 and the failure
  involves a sandbox-identity or daemon path (e.g. a turn never claimed or
  completed) — that means a "Leave — daemon" assumption is wrong.
- You find web or mobile code that opens an owned session through
  `sessions.getByNumId` or a `/sessions/<numId>` link (search
  `apps/web/src apps/mobile` for `getByNumId` and `/sessions/`) — the Step 4
  decision would then break a live page.
- `_sessions/owner.ts` turns out to import from `functions.ts` (import cycle).
- Typecheck needs `as`, `!`, `any` or `unknown` to pass.
- `api.sessionChats.get` / `listForSession` / `updatePlanContent` are not the
  public names in `convex/sessionChats.ts` / `convex/sessions.ts`.

## Maintenance notes

- New session or chat readers must call `hasSessionAccess` /
  `hasSessionChatAccess` / `hasChatParentAccess` (or `getSessionWithAccess` /
  `getSessionChatWithAccess`), never `hasRepoAccess(session.repoId)`.
- If projects gain their own privacy (e.g. draft projects), change only
  `hasOwnerEntityAccess`.
- Cost: an owned session adds one `db.get` of its task or project per check;
  standalone sessions cost the same as before.
- Reviewer: check the "Leave — daemon" rows really are sandbox-only callers,
  and that `listForSession` filtering does not hide the Main chat of a
  project session from teammates.
- Deferred: daemon callbacks (plan 009 family); `legacyIds.resolveNumId` still
  maps an owned session id to its number (harmless after Step 4); MCP
  `list_entities` already lists standalone sessions only — not re-checked here.
