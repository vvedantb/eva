# Inbox: failed runs say why, Done reads a held notification, owned sessions fold

- A failed quick task row shows why again. Since a run is a task-mode chat turn (#1557), `taskRunFailure` (was `taskRunFailedAt`) returns the failed turn's `error` with its time, from the read it already made; `needsYou` puts it on the row, one line through `inboxPreview`.
- Done on a chat row that holds a notification also marks that notification read, so History does not keep it unread. `inbox.markDone` takes the row's `notificationId` and returns `readNotificationId`; `inbox.undoDone` marks it unread again. Web and phone pass both through (`inboxDoneTarget` carries the id).
- A session that belongs to a task or project folds into its owner's row: `loadInboxChat` maps an owned session to its owner, so a `/sessions/N` link or a session `chatTarget` lands on the task or project. New since you looked still reads the owner's own read row.
