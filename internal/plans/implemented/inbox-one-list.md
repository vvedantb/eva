# Inbox: one list, the chat beside it

**Status:** Built on 26 November 2026 (see "Built" below). Plan agreed with the user on 26 November 2026. Mock: `inbox-one-list-mock.html` (same folder).

## Goal

Today the Inbox has two tabs that work differently:

- **Needs you** is a full-width list, and a row opens its page.
- **Updates** is a notification feed with an iframe preview.

A row shows no message text, and you cannot answer from the Inbox. Take from Plannotator Inbox:

- one list grouped by urgency;
- one row for each chat, with a preview;
- the chat beside the list, with a reply box and keyboard keys.

## Decisions (26 November 2026)

- **One list, three groups, in this order:**
  1. **Holding up work:** a blocking question, or a failed run that nothing restarts.
  2. **Waiting on you:** a PR to review, an @mention of you, or Eva's answer to your question.
  3. **New since you looked:** chats with new activity since you read them.
- **One row for each chat.** A chat shows once, in its most urgent group.
- **Done (E)** hides a row until something new happens in that chat. Opening a row marks it read, but the row stays until you press Done.
  - Rows in Holding up work and Waiting on you leave on their own when someone acts on them, as Needs you rows do today.
- **New since you looked** shows only chats you took part in:
  - sessions and quick tasks you own;
  - projects you created;
  - any chat you posted in or were @mentioned in.
  - Project membership alone does not count, because Eva replies too often.
- **Notifications that are not chats** (automations, deploys and the like) become rows in New since you looked. A row opens its page in the pane. Done archives the notification.
- **Rail badge:** counts Holding up work plus Waiting on you, as today (`needsYou.list`). New since you looked shows a dot only.

## Backend (`packages/backend/convex`)

1. **`chatReads` gets two optional fields.** No migration: both are optional.
   - `doneAt?: number`: when the user pressed Done.
   - `joinedAt?: number`: set by `recordPersonChatPost` for the author and for each mentioned user.
   - This table already holds one row per user and chat. Rejected: a new table. It would duplicate the read watermark and need a second lookup per chat.
2. **New `inbox.ts`, `list` query** (args: `repoId?`). It returns `InboxRow[]`:
   - **Fields:** `key`, `kind` ("chat" or "alert"), `group`, `parentId?`, `notificationId?`, `source`, `contextLabel`, `title`, `preview`, `at`, `newCount` (capped at 9), `openQuestions`, `action`, and `href`.
   - **Holding up work and Waiting on you:** the existing `needsYou` row builders, unchanged. Today's question, failed and review groups map onto them, plus @mentions and answers.
   - **New since you looked:**
     - Source: the user's `chatReads` rows, read by `by_user_repo` for each accessible repo.
     - A row counts when you took part in the chat (above) and its last activity (`lastChatActivityAt`) is later than both `lastReadAt` and `doneAt`.
     - Capped at 50 rows, newest first.
   - **Alerts:** unread, unarchived notifications with no `chatTarget`.
   - **Merge by chat:** the most urgent group wins. A shared pure function, `mergeInboxRows`, does this; it has a unit test.
   - **Preview:** the latest message of the main transcript. It is one indexed read for each row: `by_parent_and_reply_to`, descending, take 1, trimmed to 140 characters on the server.
   - **New count:** take 10, then count the messages after `lastReadAt`.
   - **Cost:** at most 50 rows, each with about 2 point reads. The query is live, so it is cheap enough without a denormalised table. Revisit if usage shows otherwise.
3. **`inbox.markDone({ parentId? , notificationId? })`** sets `doneAt` and marks the chat read. For an alert, it archives the notification. **`inbox.undoDone`** clears either one; the toast's Undo uses it.
4. **Remove** the `notifications.list` grouping helpers that only the Updates tab used. Keep `notifications.*` mutations that the phone and email still use.

## Shared (`packages/shared`)

- `inbox.ts`:
  - `INBOX_GROUPS` and their labels;
  - `mergeInboxRows`;
  - `inboxRowAction` (Answer / Review PR / Retry / none).
- `needsYou.ts` stays the source for the badge and the first two groups.

## Web (`apps/web`)

- `InboxClient` becomes one view:
  - the list on the left (`InboxList`, `InboxRow`);
  - the pane on the right;
  - the `view` search param, the Updates tab, `NeedsYouList` and `NotificationList` are removed.
- **Pane:** the existing embed iframe (`NotificationDetailPane`), opened at the chat's href in a new chat-only embed mode. That mode shows the chat column only: no side panel and no page header.
  - The parent posts `eva:embed-focus-composer` (R) and `eva:embed-focus-question` (Q). The embedded app handles them with `requestComposerFocus` and the open question card.
  - Rejected: mounting `ChatBody` directly in the Inbox. It depends on the page's session, sandbox and composer providers, which would mean a large refactor. The iframe already keeps one embedded app alive across selections.
- **Bottom bar:** the row's action (Answer, Review PR, Retry), Reply (R), the open-question picker (Q) and Done (E).
- **Keys:**
  - ↑ and ↓ move, and selecting marks the row read;
  - Enter opens the full page;
  - R reply, Q question, E done;
  - Escape clears the selection.
- **Toast** "Done · Undo" after E.
- **Repo inbox** (`/$owner/$repo/inbox`): the same list, filtered by `repoId`.

## Phone (`apps/mobile`)

- The Inbox screen shows the same grouped list from `inbox.list`.
- A tap opens the chat screen, or the thread screen for a thread.
- A swipe does Done.
- The row action buttons stay on the rows that have them.

## Order of work

One PR, because the apps must not drift:

1. backend and shared;
2. web;
3. phone;
4. changelog.

## Tests

- **Shared:** `mergeInboxRows` puts a chat in its most urgent group, keeps one row for each chat, and hides Done rows until new activity.
- **Backend:** `inbox.list` takes part-in rules into account (project member only: hidden; posted: shown), and `markDone` and `undoDone` work.

## Decided 26 November 2026

- Bulk select (today's "Select" on Updates) is dropped. Done and the keys cover it.
- No "Done" filter. A new message brings a row back, and the toast offers Undo.

## Built (differences from the plan above)

- **A read chat stays until Done.** Opening a row reads the chat, so a filter on the read time alone would drop the row at once. `chatReads.seenNewAt` (set by `markRead` when it reads new activity) keeps it listed until Done.
- **Done does not mark the chat read.** It only sets `doneAt`, so Undo brings the row back as it was. Selecting the row already reads it.
- **Done on a notification uses `notifications.archiveMany` / `unarchiveMany`**, not new `inbox` mutations.
- **Done is on New since you looked rows and on rows from a notification.** Holding up work and Waiting on you rows from live state have no Done: they leave once someone acts on them (otherwise the badge would still count a hidden row).
- **Alerts are not marked read on select.** An alert is an unread notification, so reading it would drop it from the list. Done archives it.
- **Chat-only embed** keeps the page header and, for a project, the task tabs row; only the side panel (or the quick task list) goes. The mode rides the iframe `name` at boot and each `eva:embed-navigate`.
- **No repo filter in the header.** A repo's Inbox (`/$owner/$repo/inbox`) is the filter.
- **Removed** the notification functions only the Updates tab used (`get`, `markAsUnread`, `markAllAsRead`, `markManyAsRead`, `markManyAsUnread`, `list`'s `archived` arg) and `@eva/shared/notificationGroups`.
- **New since you looked reads the newest 300 read rows per repo.** A chat whose read row is older than that does not show. Revisit if people miss rows.
