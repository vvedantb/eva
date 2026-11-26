# Inbox: one list, the chat beside it, Done

- The Inbox is one list in three groups (`@eva/shared/inbox`): Holding up work (a blocking question or a failed run), Waiting on you (a PR to review, an @mention, Eva's answer) and New since you looked. The Needs you / Updates tabs, filters, grouping and bulk select are gone.
- One row for each chat (`mergeInboxRows`): where it is from, the title, the latest message and "N new". New since you looked lists only chats you took part in: made, posted in or were @mentioned in (`chatReads.joinedAt`, set by `recordPersonChatPost`). Project membership alone does not count.
- New `inbox.list` query builds the rows from the Needs you builders, the caller's read rows and unread notifications that do not ask for them (alerts). `inbox.markDone` / `undoDone` set `chatReads.doneAt`: a chat leaves until something newer happens. Done on a notification archives it.
- A chat you read stays until Done (`chatReads.seenNewAt`, set by `chatReads.markRead` when it reads new activity).
- Web: the pane embeds the chat only (`useEmbedChatOnly`, `ResizablePanelLayout` `chatPane`) with a bar: Answer (Q), Review PR, Retry, Reply (R), Open, Done (E). Arrow keys move, Enter opens the page, Escape clears. "Done · Undo" toast.
- Phone: the same list; swipe left is Done, with Undo.
- Removed `notifications.get`, `markAsUnread`, `markAllAsRead`, `markManyAsRead`, `markManyAsUnread`, the `archived` arg of `notifications.list`, and `@eva/shared/notificationGroups`.
- Follow-up: rows are flat again, as the old notification feed (unread dot, repo logo, title over one muted line, time and type icon, dividers; the selected row is a muted background). Phone matches.
- A notification about a task, session or project (its `chatTarget`, or its link: `inboxChatRefFromHref`) folds into that chat's row: the row takes its line ("PR merged · moved to done") and time, Done is the chat's Done, and a Done chat hides the notifications from before it.
- The pane shows the chat alone for task and session links too; a reply thread opens its page with the Replies tab.
- History (bottom of the list, web and phone): the whole notification feed, read and Done ones too (`notifications.list` `history: true`).
- The project Tasks list marks the open task with a muted background, not a stripe.
