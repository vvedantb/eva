# Projects v2 — the coordinator chat as a team chat

**Date:** 2026-11-25
**Status:** TODO. Built in four PRs, in this order.
**Depends on:** v1 (`projects-as-orchestrator.md`), the Inbox (#1484).

## Decisions (user, 25 November 2026)

| # | Decision |
|---|---|
| 1 | A message wakes Eva when it has no @mention or @mentions Eva. A message that @mentions only teammates is a quiet comment: no turn, the teammates are notified. A message with @Eva and @teammates wakes Eva, and Eva leaves the teammates' part to them. |
| 2 | Inside a reply thread, @Eva gets her answer in that thread. |
| 3 | An @mention of you shows in Inbox → Needs you → Questions until you reply, as well as the usual notification. |
| 4 | Approving Triage hands the items to the coordinator. An item it adds to an open task closes as "Added to #N" and moves to Archived. |
| 5 | The coordinator replies in a few short lines. While it works, the chat shows "Eva is typing" with dots; the steps stay one tap away on the finished message. |
| 6 | Reply threads look like Slack: "N replies" with avatars under the message; a side panel ("Replies") with the message on top, its replies and a composer. Separate from task threads. |

All four PRs ship on web and phone together (CLAUDE.md parity).

## PR A — routing, quiet comments, mentions in Needs you

- Shared `chatMessageRoute(content, { evaMentioned, peopleIds })` in `@eva/shared`: `"wake" | "quiet"`. Eva is a mention target in the people picker of a project chat (a fixed item, id `eva`), so `@[Eva](eva)` marks a message for her.
- Backend: in `routePersonChatMessage` (`_projects/reports.ts`), a project chat message that routes `"quiet"` inserts the user row and returns a new outcome `"posted"`. `startExecute` returns `"posted"`; `sendSessionChatMessage` does not enqueue. Web `sendSandboxTurn` and the optimistic turn open treat `"posted"` as done. `notifyChatMentions` already notifies the teammates.
- Needs you: a new row source `mention` → group `question`: the caller's unread `mention` notifications whose chat has no later message from the caller. Key `mention:<notificationId>`, action Reply.
- Coordinator prompt: "Messages between people that @mention someone else are not for you; leave them to that person."
- Tests: shared route unit test; backend test that a quiet message opens no turn and enqueues nothing; Needs you test for a mention row.

## PR B — short replies and the typing indicator

- `COORDINATOR_RULES`: replies are 1–3 short lines; no headings; lists only when listing tasks.
- Web: in `ChatMessage`, when `assistantBubble` and the turn is streaming, render the existing `TypingIndicator` style ("Eva is typing", dots) in the Eva bubble instead of `StreamingActivityDisplay` and streaming markdown. The finished message keeps `ActivityLogDisplay` collapsed behind its existing toggle.
- Phone: same switch at `LiveAssistantMessage` when `evaBubble`.
- No backend change.

## PR C — approved Triage goes to the coordinator

- `approveProjectTasks` stamps `approvedAt` and sets `handedToCoordinatorAt`; it does not start them. It requests one coordinator wake (`reason: "triage"`, keyed by the approval batch) listing the items.
- Coordinator prompt + tools: for each handed item, either start it as is (new tool `start_task`, approved tasks only) or add it to an open task (`send_chat_message` to that task + new tool `merge_task_into` that cancels the item with "Added to #N").
- Scheduler: a handed item never auto-starts; only the coordinator starts it.
- The Triage row shows "With Eva" while handed and not yet started.
- Tests: approval wakes once and starts nothing; merge closes the item with the note; start runs it.

## PR D — reply threads

- Schema (widening only): `messages.replyTo?: Id<"messages">` and index `by_reply_to`. A reply has the root message's `parentId` and `replyTo` = root id. Root rows get a denormalised `replyCount?` and `lastReplyAt?`.
- Transcript queries skip rows with `replyTo` (they show in the panel only).
- Sending a reply: new mutation `sessions.addReply({ rootId, content })`. Routing per decision 1; a reply that wakes Eva opens her turn with `replyTo` set, and her answer row carries the same `replyTo`.
- Web: hover action "Reply" (both roles) in `ChatMessageActions`; "N replies" + avatars under a root message; right side panel (`ReplyThreadPanel`) reusing `ChatMessage` rows and the composer; Escape / X closes; ↑↓ move between threads as in the reference.
- Phone: "Reply" in the hold menu; "N replies" row; a pushed screen with the same content.
- Tests: reply hidden from the main transcript; count updates; @Eva in a reply answers in the thread.

## Open risks

- PR A changes the meaning of a plain message only for messages that @mention people; messages with no mention behave as today.
- PR C changes approval for every project; the coordinator must be awake (wake cap 10/hour still applies).
- PR D touches the transcript query on every chat; the `replyTo` filter must use an index, not a scan.
