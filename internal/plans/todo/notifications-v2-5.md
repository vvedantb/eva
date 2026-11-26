# v2.5 — Notifications for chats, threads and comments

**Date:** 26 November 2026
**Status:** C built (26 November 2026). A built (26 November 2026; mock `notifications-v2-5-threads-mock.html`). B, D TODO. Decisions settled 26 November 2026. Build order: C, A, B, D.
**Why now:** v2 made project chats team chats (quiet comments, @mentions, reply threads). People now talk to each other in Eva, but the notification system was built for "Eva finished a turn" and task comments. Several paths are silent or inconsistent.

## Today (inventory, origin/main, 26 November 2026)

- **Records:** one `notifications` row per person per event (`notifications.ts` `createNotification`, fan-out `notifyUsers`). Types include `mention`, `comment_reply`, `comment_added`, `task_assigned`, `status_changed`, `task_complete`, `routed_question`, `session_archived`, `system`. Five types are never created (`routine_complete`, `export_ready`, `run_completed`, `run_failed`, `rate_limit`).
- **Channels:** Inbox (Needs you + Updates, web and phone); web toasts, bell and desktop pop-ups (`NotificationToastStream.tsx`); tab/favicon/rail badge = Needs you count; phone push (Expo) for `mention` and `routed_question`; email via SendGrid — instant (15-minute debounce) for mention, reply, comment, assignment, routed question; daily digest 08:00 UTC Monday–Friday.
- **Chat mention urgency:** Jev classifies each chat mention as reply / fyi / none → high (push + email in 60 s) / normal (push + digest) / low (inbox only).
- **Preferences:** one switch, `users.emailNotificationsEnabled` (off by default). No per-type or per-channel choice. No push setting in the phone app.
- **Unread:** chats are unread only when an **Eva turn** finishes after your last read (`chatReads`, `lastTurnFinishedAt`). No unread state for threads, task comments or doc comments.

## Gaps found

1. **Teammate messages are invisible.** A message from a person with no @mention (including v2 "quiet comments") notifies nobody and lights no unread dot.
2. **Threads:**
   - Reply notifications open the chat, not the thread (no root id on the notification).
   - Only the root author and the 3 latest repliers are notified; earlier repliers drop off.
   - Replies to a thread under Eva's message notify nobody who took part.
   - Eva's answer in a thread notifies nobody.
   - No per-thread unread; replies don't push and aren't in Needs you.
3. **Comment mentions:** task/doc comment mentions never toast or pop up on desktop, and are not emailed on their own (only swept along with other emails or in the digest). A chat mention whose routing failed never toasts either.
4. **Clearing:** posting anything in a chat clears all your mentions there; opening the chat (or the thread) does not.
5. **Email:** the digest does not stamp `emailedAt` (an item can arrive twice); Friday 08:00 → Sunday 08:00 items are never digested.
6. **Coverage:** `routed_question` and `notify_user` rows are not in Needs you. Editing a comment to add a mention notifies no one. Doc comments have no subscribe UI.
7. **Phone:** no app-icon badge, no push setting.

## Proposed design

One rule for every event: **who** gets it (participants), **how urgent** it is, and from that **where** it goes.

| Event | Who | Inbox | Toast / desktop | Push | Email |
|---|---|---|---|---|---|
| @mention of you (chat, thread, comment) | you | Needs you | yes | yes | instant (per your setting) |
| Reply in a thread you're in | thread participants | Updates | yes | yes | digest |
| Eva answered your thread question | the asker | Needs you | yes | yes | digest |
| Teammate message in a chat you're in (no mention) | chat participants | — (unread dot only) | no | no | no |
| Comment on a task you follow | followers | Updates | yes | no | digest |
| Reply to your comment | comment author | Updates | yes | yes | instant |
| Assigned to you | assignee | Updates | yes | yes | instant |
| Eva asks you / routed question | you | Needs you | yes | yes | instant |
| Task done / status change | followers | Updates | no | no | digest |

(Jev's urgency for chat mentions stays and can lower a mention to fyi/low.)

### Building blocks

1. **Participants.** A `threadParticipants` row per person per reply thread (root author, every replier, anyone mentioned in it, the person whose question Eva answers). Same idea as `taskSubscribers`; chats use who has posted or been mentioned. Mute per thread / per chat ("Unfollow").
2. **Unread for people's messages.** `chatReads` compares against the chat's last activity from anyone (Eva turn or person message), not only Eva turns. Per-thread read state (`threadReads`: lastReadAt per person per root). "N replies" shows a dot when a thread has unread replies.
3. **Deep links.** Notifications carry `threadRootId`; web opens the Replies tab on that thread, phone opens `chat/[target]/thread/[rootId]`.
4. **Clearing.** Opening a chat clears your mentions in its main transcript; opening a thread clears that thread's mentions and replies. Posting no longer clears mentions elsewhere.
5. **Delivery fixes.** Comment mentions route like chat mentions (toast + email); failed routing falls back to `high` (toast + push + instant email). Digest stamps `emailedAt`; digest window covers weekends (Monday includes Saturday and Sunday).
6. **Preferences (web and phone).** Per channel: Email (instant for mentions and direct replies / daily digest / off), Push (on/off, phone), Desktop (on/off, per device, as today). Defaults per the table.
7. **Phone badge.** App-icon badge = Needs you count, as the web tab.
8. **Cleanups.** Remove the five dead types. Mentions added by editing a comment notify. `routed_question` and `notify_user` show in Needs you.

## Split (PRs)

- **A — Threads:** participants, thread unread, deep links, clearing rules, reply/Eva-answer notifications.
- **B — Chat unread for people's messages:** unread dot and NEW divider for teammate messages; quiet comments light the dot.
- **C — Delivery:** one routing table (above), comment mention fixes, failed-routing fallback, digest fixes, Needs you coverage, dead types. **Built.**
- **D — Preferences and phone badge:** settings UI web + phone, push toggle, app badge.

Each PR ships on web and phone together.

## Decisions (user, 26 November 2026)

| # | Decision |
|---|---|
| 1 | A teammate's message without a mention (quiet comments included): unread dot and NEW divider only; no Inbox row, toast, push or email. |
| 2 | Thread participants are automatic (root author, repliers, people mentioned in it, the person Eva answers), each with Unfollow. |
| 3 | Email default for people who never changed the setting: instant for mentions, direct replies, assignments and Eva's questions; daily digest for the rest. A person who turned email off stays off. |
| 4 | Order: C (delivery fixes) → A (threads) → B (chat unread) → D (preferences and phone badge). |

## Changes while building

### C — Delivery (26 November 2026)

- The table lives in `@eva/shared/notificationRouting` (`NOTIFICATION_ROUTES` plus `notificationToasts`, `notificationPushes`, `notificationEmail`, `isNeedsYouNotification`, `isAwaitingRouting`).
- Types not in the table: `changes_requested` toasts, no push, no email (as before); `session_archived` is inbox only (it no longer toasts); `system` toasts, no push, digest. `comment_reply` is both "reply to your comment" and a thread reply today, so both are instant email with push until A splits them.
- Urgency `normal` means the table, except on a chat mention (a `mention` without `commentId`), where it is Jev's fyi and waits for the digest. Comment mentions are created with `normal` and keep the instant email.
- Failed routing falls back to `high` (user, 26 November 2026): toast, push and instant email, so a mention never loses its email when the judge fails.
- Digest window: since the previous weekday run (no per-user state). With `emailedAt` stamped, an overlap never repeats a row.
- Needs you: an agent `notify_user` row is a `system` row with a `chatTarget`; an automation's email draft has none, so it stays out. Posting in a chat clears every Needs you row for that chat, not only mentions.
- Doc comments have no edit mutation, so only task comment edits notify new mentions.
- Dead types: prod still held `routine_complete` (2), `run_completed` (1166) and `run_failed` (7) rows. Convex refuses a deploy whose schema rejects stored rows, so those three stay in the validator as legacy until `dataMigrations:deleteDeadNotifications` has run; a follow-up drops them. `export_ready` and `rate_limit` had no rows and are removed. `scripts/check-schema-narrowing.mjs` does not watch `_validators/enums.ts`, where the union lives, so it would not have caught this.

### A — Threads (26 November 2026)

- Eva's answer to your thread question is in Needs you (Questions), as the approved mock shows, not Updates as the table first said. The table above is updated.
- Thread replies have their own type, `thread_reply` (digest email), because `comment_reply` (reply to your comment) keeps the instant email. Eva's answer is `thread_answer`.
- Per-thread read state lives on the participant row (`threadParticipants.lastReadAt`), not in a separate `threadReads` table.
- A turn records who asked (`turns.askedBy`, thread turns only). Reading the thread's last @Eva reply cannot work: two @Eva replies can wait in the queue, and the first answer would go to the second asker.
- "Read up to" is the newest reply's creation time, not the clock: two rows written in the same millisecond still order.
- Eva's answer notifies only the asker, also after they unfollow (they asked her). Other followers do not get a notification for it, but it counts in their "N new".
- "N new" shows only for followers. Opening a thread you are not in does not make you a participant; Follow does (read up to the newest reply).
- The "New" line in a thread reuses the chat's NEW divider, so it uses the accent colour like the chat, not a fixed blue. The "N new" pill uses the mention blue (`--mention`, `EVA_THEME.mention`).
- Existing threads: `dataMigrations:backfillThreadParticipants` makes root authors, repliers and the people they mention followers, read up to the migration.
