# Inbox: one list, the chat beside it, Done

- The Inbox is one list in three groups (`@eva/shared/inbox`): Holding up work (a blocking question or a failed run), Waiting on you (a PR to review, an @mention, Eva's answer) and New since you looked. The Needs you / Updates tabs, filters, grouping and bulk select are gone.
- One row for each chat (`mergeInboxRows`): where it is from, the title, the latest message and "N new". New since you looked lists only chats you took part in: made, posted in or were @mentioned in (`chatReads.joinedAt`, set by `recordPersonChatPost`). Project membership alone does not count.
- New `inbox.list` query builds the rows from the Needs you builders, the caller's read rows and unread notifications that do not ask for them (alerts). `inbox.markDone` / `undoDone` set `chatReads.doneAt`: a chat leaves until something newer happens. Done on a notification archives it.
- A chat you read stays until Done (`chatReads.seenNewAt`, set by `chatReads.markRead` when it reads new activity).
- Web: the pane embeds the chat only (`useEmbedChatOnly`, `ResizablePanelLayout` `chatPane`) with a bar: Answer (Q), Review PR, Retry, Reply (R), Open, Done (E). Arrow keys move, Enter opens the page, Escape clears. "Done · Undo" toast.
- Phone: the same list; swipe left is Done, with Undo.
- Removed `notifications.get`, `markAsUnread`, `markAllAsRead`, `markManyAsRead`, `markManyAsUnread`, the `archived` arg of `notifications.list`, and `@eva/shared/notificationGroups`.
