# Unread indicator for session, quick-task and project chats

Status: implemented (Phases 0–3). Written and implemented 2026-10-07 (PR #916). Phase 4 (rail and favicon counts, optimistic update) stays open.

## Goal

Show which chats have a new agent reply the current user has not seen yet. One dot, same meaning, on all three surfaces: sessions, quick tasks and projects. Inside the chat, a "NEW" divider marks where the unseen replies start.

**Why:**
- Today the only "something happened" signal is the "Working" animation while a turn runs. Once the turn ends, the row looks the same as every other row.
- Inbox notifications are per event and live in a separate panel. Opening the chat does not clear them.
- Chats are shared by every team member of a repo (`hasRepoAccess`). "Read" is a per-user fact, so it cannot live on the session, task or project document.

## Decisions (2026-10-07)

- Sidebar session row: trailing `bg-primary` dot, same as the changelog link.
- Only chat turns count. Quick-task autonomous runs (`agentRuns`) do not.
- Row dots only in v1. Rail tile and favicon counts are Phase 4.
- **Only my chats.** A chat lights up only when the user owns it, is a member, or has opened it before. See the definition below.
- Simple view shows the dot (not asked; unread is a different signal from the awake counts #913 hid).

## Definition of unread

A chat is unread for user U when:

```
isMine(U, entity)
  && entity.lastTurnFinishedAt !== undefined
  && entity.lastTurnFinishedAt > (chatReads[U, entity].lastReadAt ?? 0)
```

`isMine(U, entity)` is true when any of these hold:
- `entity.userId === U` (sessions, projects) or `entity.createdBy === U` (sessions, tasks);
- `project.members` includes U;
- a `chatReads` row exists for `[U, entity]`, which means U opened it at least once.

Notes:
- `lastTurnFinishedAt` is stamped when a durable turn closes (`closeTurn` in `_chat/turnStore.ts:363`). This is the one place every turn on every surface ends, including `error` and `cancelled`.
- A turn finishing is the unit of "new message". A teammate's user message in one of my chats always starts a turn, so it is covered when that turn ends.
- Old chats have no `lastTurnFinishedAt`, so nothing lights up on rollout. No backfill.
- A chat I own but have never opened lights up after its first finished turn. That is the normal case: I start a session, leave, the agent replies.
- A teammate's chat I have never opened stays quiet until I open it once. After that it behaves like mine.
- While a turn is open, `isExecuting` wins in the UI. The dot appears when the turn ends.

Not counted: quick-task autonomous runs (`agentRuns`), system alerts, messages posted without a turn.

## Current state

- **One `messages` table, one `turns` table** for all three surfaces. `turns.entityId` is `Id<"sessions"> | Id<"agentTasks"> | Id<"projects">` (`_validators/tableFields.ts:245`).
- **`closeTurn`** already patches the turn and calls `touchAgentFinished`. `sandboxActivity.lastAgentFinishedAt` is throttled to one write per minute (`_sandbox/activity.ts:66`) and is per entity, so it is not usable as the watermark.
- **List queries already compute `isExecuting` per row** with one indexed query per repo (`openChatEntityIdsForRepo`, `_chat/turnProjection.ts:45`). `hasUnread` sits beside it:
  - sessions: `toSessionListItem` in `_sessions/queries.ts:83`;
  - quick tasks: `enrichTasksWithLastRun` in `_agentTasks/queries.ts:50` and `listByProject` (same file, ~line 290);
  - projects: `list` in `_projects/queries.ts:40` (computes no `isExecuting` today).
- **Per-user row tables already exist** as a pattern: `taskSubscribers` (`[taskId, userId]`), `docSubscribers`, `notifications`.
- **Unread dot pattern** exists: `ChangelogUnreadDot` (`sidebar/_components/ChangelogUnreadDot.tsx`) is a `CountPop` with `size-1.5 rounded-full bg-primary` and an `sr-only` label. In this codebase `bg-primary` means unread and `bg-success` means running.
- **Sessions stay mounted after you leave them.** `sessions/route.tsx:47` keeps up to `MAX_CACHED_SESSIONS` shells mounted but hidden. `ChatPanel` gets `isRouteActive` and skips its queries when false. Mark-as-read must gate on this flag, or a hidden session marks itself read.
- `ChatBody` is the one shared chat body for all three panels (`ChatPanel.tsx:436`, `TaskSandboxChatPanel.tsx:386`, `ProjectSandboxChatPanel.tsx:332`). `useAgentReplyChime` already lives there and watches the same executing → idle edge.

## Design

### Data

1. **New table `chatReads`** (fields in `_validators/tableFields.ts`, table in `schema.ts`):
   ```ts
   export const chatReadFields = {
     userId: v.id("users"),
     parentId: chatParentIdValidator, // sessions | agentTasks | projects
     repoId: v.id("githubRepos"),
     lastReadAt: v.number(),
   };
   // indexes: by_user_parent [userId, parentId], by_user_repo [userId, repoId]
   ```
   `repoId` lets a list query load all of one user's read rows for one repo in a single indexed read, then join in memory. No N+1.

2. **New optional field `lastTurnFinishedAt: v.optional(v.number())`** on `sessionFields`, `agentTaskFields` and `projectFields`. Written once per turn in `closeTurn`:
   ```ts
   await ctx.db.patch(turn.entityId, { lastTurnFinishedAt: finishedAt });
   ```
   `turn.entityId` is already a union id, so one patch serves all three tables. One write per turn end is cheap; the completion handlers patch the same document in the same mutation already (status, `updatedAt`).

   **Rejected:** reading the newest closed turn per row from `turns.by_entity_open`. It needs no schema change, but it is one index read per row and depends on `_creationTime` ordering of turns. The field is one line and keeps list queries flat.

### Backend read model (`packages/backend/convex/chatReads.ts`)

- `unreadLookupForRepo(db, userId, repoId)`: loads `by_user_repo` rows once, returns `(entity) => boolean` that applies `isMine` and the watermark compare. Linked sessions from other repos (`gatherLinkedSessions`) fall back to a `by_user_parent` point read; they are few.
- `isMine` lives in the same file as one pure function over `{ userId?, createdBy?, members? }` so the three list queries and `isUnread` share it.
- Add `hasUnread: v.boolean()` to `sessionListItemValidator`, `agentTaskWithLastRunValidator` and `projectListItemValidator`, filled from the lookup.
- `isUnread = authQuery({ parentId })` → `{ hasUnread: boolean }`. Used by the open chat only, to decide when to mark read.
- `markRead = authMutation({ parentId })`: `assertMessageParentAccess`, then upsert `{ lastReadAt: Date.now() }`. Skip the write when the row is already newer than `entity.lastTurnFinishedAt`, so repeat calls on mount do not churn.

### Client: when to mark read

One hook in `ChatBody`, next to `useAgentReplyChime`, so all three surfaces get it from one place:

```ts
useMarkChatRead({ parentId: chatParentId, active: isRouteActive && documentVisible });
```

- Subscribes to `api.chatReads.isUnread` (skipped while `active` is false).
- `documentVisible` comes from a small `useDocumentVisible()` built on `useSyncExternalStore` over `visibilitychange`. No `useState`.
- A `useEffect` calls `markRead` when `active && hasUnread`. The effect is justified: the trigger is a server-side change arriving over a live query, same reasoning as the chime hook. Dependencies are `[parentId, active, hasUnread]`, so it fires on open, on tab focus, and when a turn finishes while the user is looking. It does not fire for hidden cached sessions.
- `ChatBody` gains one prop, `isRouteActive?: boolean` (default `true`). Only `ChatPanel` passes it.

No server-side mark on send is needed. The user's own message starts a turn; the dot only appears when that turn ends, which is after they sent it.

### Client: "NEW" divider in the thread

When a chat opens with unread replies, a divider marks where they start, Discord-style: a thin line on each side and a small "NEW" label in the primary colour (user mock-up, 2026-10-07).

**Anchor.** The divider needs the read time from *before* `markRead` moves it. `isUnread` returns `{ hasUnread, lastReadAt }`. The hook becomes `useChatReadState` and:
- on the first observation after the chat becomes active, stores `anchor = hasUnread ? (lastReadAt ?? 0) : undefined` in a ref, the same first-observation pattern `useAgentReplyChime` uses;
- keeps the anchor while the chat stays active, even after `markRead` updates `lastReadAt` and new turns finish;
- resets when `parentId` changes or `active` goes false → true, so a cached session that comes back gets a fresh anchor;
- returns `newSinceAt: number | undefined`.

**Placement.** `findNewBoundaryId(messages, newSinceAt)` in `chatBodyUtils.ts`, beside `findDayBoundaryIds`: the first message with `(finishedAt ?? timestamp) > newSinceAt` and either `role === "assistant"` or `isOtherUserChatMessage`. Own user messages never start the "new" block. `renderMessage` renders `ChatNewDivider` above that message, after `ChatDayDivider` when both apply. Rendering stays in `ChatBody`, so all three surfaces get it.

**Component.** `_components/ChatNewDivider.tsx`:
```tsx
<div role="separator" aria-label="New messages" className="flex items-center gap-3 py-1 select-none">
  <span className="h-px flex-1 bg-primary/30" />
  <span className="text-2xs font-medium tracking-wide text-primary uppercase">New</span>
  <span className="h-px flex-1 bg-primary/30" />
</div>
```
`ChatDayDivider` is text only under the no-decorative-hairline rule. This one keeps the lines because they mark a boundary in the thread, which the mock-up asks for, and because a label alone does not read as "everything below is new". `design-check.mjs` does not flag `bg-*/30` rules.

**Colour (decided 2026-10-07).** Label and lines use the `primary` token only (`text-primary`, `bg-primary/30`). `--primary` is the accent the user picks in theme settings (`docs/eva-ui.md`, "Surfaces"), so the divider follows their theme. No hex, no `text-blue-*`, no `--chart-*`. The row dots use the same token, so unread has one colour everywhere.

**Lifecycle.** The divider stays until the user leaves the chat. It does not vanish when `markRead` fires. New replies that finish while the user is looking fall below the divider, which is correct: they are also new since open.

**Scroll.** The chat keeps opening at the bottom (today's behaviour via `Conversation`). The unread reply is usually the last message, so the divider is on screen. If several turns are unread the divider can sit above the fold. Follow-up, not v1: scroll to the divider on open, or mark it on the jump rail.

### UI

Extract the dot from `ChangelogUnreadDot` into `ui/UnreadDot.tsx` (`CountPop`, `size-1.5 rounded-full bg-primary`, `sr-only` "Unread"). `ChangelogUnreadDot` uses it too.

| Surface | Where | Note |
|---|---|---|
| Sessions | `SidebarSessionItem.tsx`, trailing slot (`ml-auto`), as the changelog link does | `SessionStatusLeading` keeps the sandbox status dot and "Working" animation. |
| Quick tasks | `quick-tasks/QuickTaskCard.tsx` (kanban and list), `QuickTasksListSplit` rows | Beside the `isAgentActive` indicator. |
| Projects | `projects/ProjectCard.tsx`; sandbox tab in `ProjectMainTabs.tsx` and `SandboxSurfaceTabs.tsx`; project task rows in `ProjectActiveLayout` | The project chat lives on the sandbox surface, so the tab needs the dot when the page is open on another surface. |

Simple view: show the dot. #913 hid awake-sandbox counts in simple view; unread is a different signal. Confirm (open question).

## Phases

Ship each phase on its own.

### Phase 0: schema and watermark
1. `chatReads` table and indexes. `lastTurnFinishedAt` on the three entity field sets.
2. `closeTurn` patches `lastTurnFinishedAt`.
3. `npx convex codegen --typecheck enable`.
Check: finish a turn on each surface and read the field in the Convex dashboard.

### Phase 1: read model
1. `chatReads.ts`: `unreadLookupForRepo`, `isUnread`, `markRead`.
2. `hasUnread` on the three list validators and queries.
Check: `hasUnread` is true for a finished chat with no read row and false after calling `markRead` from the dashboard.

### Phase 2: mark read from the open chat, and the "NEW" divider
1. `useDocumentVisible` and `useChatReadState` in `lib/components/chat/`. `isUnread` returns `{ hasUnread, lastReadAt }`.
2. Wire into `ChatBody`; pass `isRouteActive` from `ChatPanel`.
3. `findNewBoundaryId` in `chatBodyUtils.ts`, `ChatNewDivider`, and the render in `renderMessage`.
Check: open chat A, start a turn, switch to chat B before it ends. A shows unread. Open A: the "NEW" divider sits above the finished reply and the dot clears. The divider stays while A is open. Switch to B and back to A: no divider. Finish another turn in A while B is open: the hidden shell for A does not clear the dot.

### Phase 3: dots on the three surfaces
1. `UnreadDot`; replace the markup in `ChangelogUnreadDot`.
2. Session sidebar row, quick-task cards and rows, project card, project tabs, project task rows.
Check: `design-check.mjs`, `compiler-check.mjs`, no banned types, `tsc`.

### Phase 4 (optional, later)
- Per-repo unread count on the rail tile (`RailUnreadBadge`), and in the favicon via `setDocumentUnreadCount`.
- `.withOptimisticUpdate` on `markRead` to flip `hasUnread` in the list queries before the round trip.

### Final: `/changelog`, then `/ship`.

## Edge cases

- **Cached hidden sessions:** gated by `isRouteActive`. Covered in Phase 2.
- **Two tabs open on the same chat:** both subscribe; the first `markRead` clears both. Correct.
- **Turn ends in `error` or `cancelled`:** counts as unread. If the user cancelled it, they are looking at the chat and it clears at once.
- **Archived or deleted chats:** list queries already filter them. No dot.
- **Legacy turns** (`isLegacySessionExecuting` bridge): they do not go through `closeTurn`, so they never set the watermark. They are a deployment bridge only.
- **Teammates:** a chat I never opened stays quiet (`isMine` is false and no read row). Once I open it, it joins my set. Chats I own light up even if I never opened them after creation.

## Open questions

None blocking. Later: should `agentRuns` count (one call in `_taskWorkflow/helpers.ts:184`), and whether Phase 4 counts should include only `isMine` chats (yes, same rule).
